import Stripe from "stripe";
import { db } from "./db";
import {
  createOrgInvoiceSubscription,
  loadOrgPayer,
  orgIdOf,
  orgPriceData,
  orgQuery,
  type InvoiceDetails,
  type OrgPayerError,
} from "./stripe-org-billing";

/**
 * Server side of billing. Runs only on the Vercel deployment
 * (tutaide.vercel.app), the one place STRIPE_SECRET_KEY is set. The desktop
 * app never has the key: it calls /api/billing/* on Vercel via lib/billing.ts.
 */

// Tutellia user ids are Prisma cuids. Strict check also keeps them safe to
// embed in Stripe search queries.
const USER_ID_RE = /^[a-z0-9]{20,40}$/;

// Desktop app's local server (prod 3456, dev 3000) or the Vercel web app.
const RETURN_URL_RE = /^(http:\/\/(localhost|127\.0\.0\.1):(3000|3456)|https:\/\/tutaide\.vercel\.app)\//;

// Live subscriptions. past_due = Stripe is retrying the card; unpaid = retries
// exhausted, invoice still open. The desktop app grants 30 days of grace from
// the failed renewal (lib/billing.ts); payment is fixed through the customer
// portal, never by opening a second subscription.
const ACCESS_STATUSES = new Set<string>(["active", "trialing", "past_due"]);
const LIVE_STATUSES = new Set<string>([...ACCESS_STATUSES, "unpaid"]);

export type BillingStatusPayload = {
  status: string;
  /** Start of the current period = date of the last renewal (failed one, for past_due/unpaid). */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** "invoice" = paid on a yearly invoice (structures), "card" = automatic charge. */
  collection: "card" | "invoice";
  /** Due date of the open invoice of an invoice-paid subscription, else null. */
  paymentDueAt: string | null;
};

let client: Stripe | null = null;

/** Null when the key is not configured (desktop build, or Vercel env missing). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_RE.test(value);
}

export function isValidReturnUrl(value: unknown): value is string {
  return typeof value === "string" && RETURN_URL_RE.test(value);
}

/** Newer Stripe API versions moved current_period_* onto subscription items. */
function periodBound(sub: Stripe.Subscription, bound: "current_period_start" | "current_period_end"): string | null {
  const legacy = (sub as unknown as Record<string, number | undefined>)[bound]; // pre-2025 API shape
  const seconds = legacy ?? sub.items.data[0]?.[bound];
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Needs `latest_invoice` expanded; an unexpanded id gives null. */
function openInvoiceDue(sub: Stripe.Subscription): string | null {
  const invoice = sub.latest_invoice;
  if (typeof invoice !== "object" || invoice === null || invoice.status !== "open" || !invoice.due_date) return null;
  return new Date(invoice.due_date * 1000).toISOString();
}

export function toBillingStatus(sub: Stripe.Subscription | null): BillingStatusPayload {
  if (!sub) {
    return { status: "none", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, collection: "card", paymentDueAt: null };
  }
  const isInvoice = sub.collection_method === "send_invoice";
  return {
    status: sub.status,
    currentPeriodStart: periodBound(sub, "current_period_start"),
    currentPeriodEnd: periodBound(sub, "current_period_end"),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    collection: isInvoice ? "invoice" : "card",
    paymentDueAt: isInvoice ? openInvoiceDue(sub) : null,
  };
}

/**
 * The subscription covering this user: their structure's when they belong to
 * one (one subscription for all members), else their own. One granting access
 * first, else the latest.
 */
export async function findSubscription(stripe: Stripe, userId: string): Promise<Stripe.Subscription | null> {
  const orgId = await orgIdOf(userId);
  const result = await stripe.subscriptions.search({
    query: orgId ? orgQuery(orgId) : `metadata['tutelliaUserId']:'${userId}'`,
    limit: 10,
    expand: ["data.latest_invoice"],
  });
  const subs = [...result.data].sort((a, b) => b.created - a.created);
  return subs.find((s) => LIVE_STATUSES.has(s.status)) ?? subs[0] ?? null;
}

/** Confirms a just-finished checkout without waiting for Stripe's search index (~1 min lag). */
export async function subscriptionFromSession(
  stripe: Stripe,
  sessionId: string | null,
  userId: string
): Promise<Stripe.Subscription | null> {
  if (!sessionId?.startsWith("cs_")) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription", "subscription.latest_invoice"] });
  if (session.client_reference_id !== userId || session.status !== "complete") return null;
  return typeof session.subscription === "object" ? session.subscription : null;
}

/**
 * Individual plan by default; Entreprise accounts pay the yearly amount the
 * admin set on the account, billed under the Entreprise product.
 */
function lineItem(customAmountCents: number | null): Stripe.Checkout.SessionCreateParams.LineItem {
  if (customAmountCents === null) {
    return { price: process.env.STRIPE_PRICE_INDIVIDUAL, quantity: 1 };
  }
  return {
    quantity: 1,
    price_data: {
      currency: "eur",
      product: process.env.STRIPE_PRODUCT_ENTREPRISE ?? "",
      unit_amount: customAmountCents,
      recurring: { interval: "year" },
    },
  };
}

export function withQuery(url: string, query: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

// Stripe refuses a trial_end less than 48 h away; keep a margin.
const MIN_TRIAL_MS = 49 * 60 * 60 * 1000;

/**
 * Existing clients: the admin sets the date of their first charge. Until then
 * the subscription is a Stripe trial (card saved, 0 € today); Stripe charges
 * automatically on that date. Too close or past: no trial, charge now.
 */
function trialEnd(billingStartsAt: Date | null): number | undefined {
  if (!billingStartsAt || billingStartsAt.getTime() - Date.now() < MIN_TRIAL_MS) return undefined;
  return Math.floor(billingStartsAt.getTime() / 1000);
}

function deferredStart(billingStartsAt: Date | null): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  const end = trialEnd(billingStartsAt);
  return end ? { trial_end: end } : {};
}

export type CheckoutResult =
  | { url: string }
  | { error: "not_found" | "not_billable" | "already_subscribed" | OrgPayerError };

/** A structure pays by card: its admin goes through Stripe Checkout once, then Stripe charges every year. */
async function createOrgCheckoutSession(stripe: Stripe, userId: string, returnUrl: string): Promise<CheckoutResult> {
  const payer = await loadOrgPayer(userId);
  if ("error" in payer) return payer;
  const existing = await findSubscription(stripe, userId);
  if (existing && LIVE_STATUSES.has(existing.status)) return { error: "already_subscribed" };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: orgPriceData(payer.plan) }],
    client_reference_id: userId,
    subscription_data: { metadata: { tutelliaOrgId: payer.orgId }, ...deferredStart(payer.startsAt) },
    payment_method_collection: "always",
    customer_email: payer.email,
    locale: "fr",
    billing_address_collection: "required",
    success_url: withQuery(returnUrl, "checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: withQuery(returnUrl, "checkout=cancel"),
  });
  return session.url ? { url: session.url } : { error: "not_found" };
}

export type InvoiceResult = { ok: true } | { error: "already_subscribed" | OrgPayerError };

/** A structure pays by invoice: Stripe emails the first invoice now (or on the first charge date). */
export async function createOrgInvoice(stripe: Stripe, userId: string, details: InvoiceDetails): Promise<InvoiceResult> {
  const payer = await loadOrgPayer(userId);
  if ("error" in payer) return payer;
  const existing = await findSubscription(stripe, userId);
  if (existing && LIVE_STATUSES.has(existing.status)) return { error: "already_subscribed" };
  await createOrgInvoiceSubscription(stripe, payer, details, trialEnd(payer.startsAt));
  return { ok: true };
}

export async function createCheckoutSession(
  stripe: Stripe,
  userId: string,
  returnUrl: string
): Promise<CheckoutResult> {
  if (await orgIdOf(userId)) return createOrgCheckoutSession(stripe, userId, returnUrl);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      archivedAt: true,
      billingRequired: true,
      billingCustomAmountCents: true,
      billingStartsAt: true,
    },
  });
  if (!user || user.archivedAt !== null) return { error: "not_found" };
  if (!user.billingRequired) return { error: "not_billable" };

  // Never let a double click or a stale page charge someone twice.
  const existing = await findSubscription(stripe, userId);
  if (existing && LIVE_STATUSES.has(existing.status)) return { error: "already_subscribed" };

  // Reuse the Stripe customer if this email paid before (re-subscription).
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  const customer = customers.data[0];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem(user.billingCustomAmountCents)],
    client_reference_id: userId,
    subscription_data: { metadata: { tutelliaUserId: userId }, ...deferredStart(user.billingStartsAt) },
    // Always take the card, even when nothing is charged today (deferred start).
    payment_method_collection: "always",
    ...(customer ? { customer: customer.id } : { customer_email: user.email }),
    locale: "fr",
    allow_promotion_codes: true,
    billing_address_collection: "required",
    success_url: withQuery(returnUrl, "checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: withQuery(returnUrl, "checkout=cancel"),
  });

  return session.url ? { url: session.url } : { error: "not_found" };
}
