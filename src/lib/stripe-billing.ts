import Stripe from "stripe";
import { db } from "./db";

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

// Statuses that keep access open. past_due = Stripe is still retrying the card.
const ACCESS_STATUSES = new Set<string>(["active", "trialing", "past_due"]);

export type BillingStatusPayload = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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

/** Newer Stripe API versions moved current_period_end onto subscription items. */
function periodEnd(sub: Stripe.Subscription): string | null {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end; // pre-2025 API shape
  const seconds = legacy ?? sub.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export function toBillingStatus(sub: Stripe.Subscription | null): BillingStatusPayload {
  if (!sub) return { status: "none", currentPeriodEnd: null, cancelAtPeriodEnd: false };
  return { status: sub.status, currentPeriodEnd: periodEnd(sub), cancelAtPeriodEnd: sub.cancel_at_period_end };
}

/** The user's most relevant subscription: one granting access first, else the latest. */
export async function findSubscription(stripe: Stripe, userId: string): Promise<Stripe.Subscription | null> {
  const result = await stripe.subscriptions.search({
    query: `metadata['tutelliaUserId']:'${userId}'`,
    limit: 10,
  });
  const subs = [...result.data].sort((a, b) => b.created - a.created);
  return subs.find((s) => ACCESS_STATUSES.has(s.status)) ?? subs[0] ?? null;
}

/** Confirms a just-finished checkout without waiting for Stripe's search index (~1 min lag). */
export async function subscriptionFromSession(
  stripe: Stripe,
  sessionId: string | null,
  userId: string
): Promise<Stripe.Subscription | null> {
  if (!sessionId?.startsWith("cs_")) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
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
function deferredStart(billingStartsAt: Date | null): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  if (!billingStartsAt || billingStartsAt.getTime() - Date.now() < MIN_TRIAL_MS) return {};
  return { trial_end: Math.floor(billingStartsAt.getTime() / 1000) };
}

export type CheckoutResult =
  | { url: string }
  | { error: "not_found" | "not_billable" | "already_subscribed" };

export async function createCheckoutSession(
  stripe: Stripe,
  userId: string,
  returnUrl: string
): Promise<CheckoutResult> {
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
  if (existing && ACCESS_STATUSES.has(existing.status)) return { error: "already_subscribed" };

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
