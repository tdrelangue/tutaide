import { createHash } from "crypto";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "./db";
import { resolveOrgPlan, type OrgPlan } from "./organizations/billing-plan";

/**
 * Server side (Vercel only) of a structure's subscription: ONE subscription
 * for all its members, tagged `tutelliaOrgId`. The structure admin chooses how
 * to pay: by card (Stripe Checkout, automatic yearly charge) or by invoice
 * (Stripe emails a yearly invoice, paid by bank transfer or card from the
 * invoice page; the accepted methods are those enabled in Stripe's invoice
 * settings).
 */

/** Days a structure has to pay its yearly invoice (usual French B2B / public-sector delay). */
export const INVOICE_DAYS_UNTIL_DUE = 30;

/** Stripe search key of a structure's subscriptions and customer. Ids are checked cuids. */
export function orgQuery(orgId: string): string {
  return `metadata['tutelliaOrgId']:'${orgId}'`;
}

/** The structure whose subscription covers this user, or null for a solo account. */
export async function orgIdOf(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { orgId: true } });
  return user?.orgId ?? null;
}

export type OrgPayer = {
  readonly orgId: string;
  readonly orgName: string;
  readonly email: string;
  readonly plan: OrgPlan;
  readonly startsAt: Date | null;
};

export type OrgPayerError = "not_found" | "not_org_admin" | "not_billable";

/** Only the structure's admin pays, and only for a paying structure with a price. */
export async function loadOrgPayer(userId: string): Promise<OrgPayer | { error: OrgPayerError }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      archivedAt: true,
      isOrgAdmin: true,
      organization: {
        select: {
          id: true,
          name: true,
          archivedAt: true,
          billingRequired: true,
          billingCustomAmountCents: true,
          billingCustomMaxSeats: true,
          billingStartsAt: true,
          billingOffer: { select: { name: true, yearlyAmountCents: true, maxSeats: true } },
        },
      },
    },
  });
  const org = user?.organization;
  if (!user || user.archivedAt !== null || !org || org.archivedAt !== null) return { error: "not_found" };
  if (!user.isOrgAdmin) return { error: "not_org_admin" };
  const plan = resolveOrgPlan(org);
  if (!org.billingRequired || plan === null) return { error: "not_billable" };
  return { orgId: org.id, orgName: org.name, email: user.email, plan, startsAt: org.billingStartsAt };
}

export function orgPriceData(plan: OrgPlan) {
  const product = process.env.STRIPE_PRODUCT_ENTREPRISE;
  if (!product) {
    const error = new Error("STRIPE_PRODUCT_ENTREPRISE is not set on Vercel");
    error.name = "BillingConfigError"; // the routes log the name only
    throw error;
  }
  return {
    currency: "eur",
    product,
    unit_amount: plan.yearlyAmountCents,
    recurring: { interval: "year" as const },
  };
}

export const invoiceDetailsSchema = z.object({
  companyName: z.string().trim().min(2, "Nom de la structure requis").max(120),
  email: z.string().trim().email("Email de facturation invalide").max(200),
  line1: z.string().trim().min(3, "Adresse requise").max(200),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Code postal : 5 chiffres"),
  city: z.string().trim().min(1, "Ville requise").max(120),
  /** Bon de commande, n° d'engagement… printed on the invoice. Optional. */
  reference: z.string().trim().max(30, "Référence : 30 caractères maximum").optional(),
});
export type InvoiceDetails = z.infer<typeof invoiceDetailsSchema>;

/**
 * Same structure + same details on the same day = same Stripe request: a double
 * click or a retry never creates a second customer or subscription (Stripe's
 * search, used to detect an existing subscription, lags about a minute).
 */
function idempotencyKey(kind: string, orgId: string, details: InvoiceDetails): string {
  const day = new Date().toISOString().slice(0, 10);
  const digest = createHash("sha256").update(JSON.stringify(details)).digest("hex").slice(0, 16);
  return `tutellia-${kind}-${orgId}-${day}-${digest}`;
}

/** The structure's Stripe customer, created or updated with the billing details typed by its admin. */
async function upsertOrgCustomer(stripe: Stripe, orgId: string, details: InvoiceDetails): Promise<string> {
  const fields: Stripe.CustomerCreateParams = {
    name: details.companyName,
    email: details.email,
    address: { line1: details.line1, postal_code: details.postalCode, city: details.city, country: "FR" },
    preferred_locales: ["fr"],
    metadata: { tutelliaOrgId: orgId },
  };
  const found = await stripe.customers.search({ query: orgQuery(orgId), limit: 1 });
  const existing = found.data[0];
  if (existing) {
    await stripe.customers.update(existing.id, fields);
    return existing.id;
  }
  return (await stripe.customers.create(fields, { idempotencyKey: idempotencyKey("customer", orgId, details) })).id;
}

/** "Commande n° …" on every invoice when the structure gave a reference. */
function invoiceReference(reference: string | undefined): Stripe.SubscriptionCreateParams["invoice_settings"] {
  if (!reference) return undefined;
  // Stripe caps a custom field's value at 30 characters.
  return { custom_fields: [{ name: "Référence", value: reference.slice(0, 30) }] };
}

/**
 * Pay by invoice: a subscription Stripe bills by email every year, due in
 * INVOICE_DAYS_UNTIL_DUE days. `trialEnd` defers the first invoice (existing
 * clients whose current year is already paid).
 */
export async function createOrgInvoiceSubscription(
  stripe: Stripe,
  payer: OrgPayer,
  details: InvoiceDetails,
  trialEnd: number | undefined
): Promise<void> {
  const customer = await upsertOrgCustomer(stripe, payer.orgId, details);
  await stripe.subscriptions.create({
    customer,
    collection_method: "send_invoice",
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    items: [{ price_data: orgPriceData(payer.plan) }],
    metadata: { tutelliaOrgId: payer.orgId },
    invoice_settings: invoiceReference(details.reference),
    ...(trialEnd ? { trial_end: trialEnd } : {}),
  }, { idempotencyKey: idempotencyKey("invoice-sub", payer.orgId, details) });
}
