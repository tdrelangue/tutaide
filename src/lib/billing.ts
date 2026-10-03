import { headers } from "next/headers";
import { db } from "./db";

/**
 * Tutellia subscription billing.
 *
 * Stripe is the source of truth. The Stripe secret is set only on the Vercel
 * deployment (tutaide.vercel.app), whose /api/billing routes talk to Stripe
 * (lib/stripe-billing.ts). This app's .env ships inside the desktop installer,
 * so the desktop never holds the key and always calls those routes.
 */

const BILLING_API_URL = process.env.BILLING_API_URL ?? "https://tutaide.vercel.app/api/billing";

/** Stripe no-code customer portal login link (public URL, safe to ship). */
export const BILLING_PORTAL_URL = process.env.STRIPE_PORTAL_LOGIN_URL ?? null;

/** Individual plan price, shown before payment so it is never a surprise. */
export const BILLING_PRICE_LABEL = process.env.BILLING_PRICE_LABEL ?? "30 € / an";

/** "1 200 € / an" for an Entreprise account's custom yearly amount. */
export function formatYearlyPrice(amountCents: number): string {
  const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amountCents / 100);
  return `${euros} € / an`;
}

const REQUEST_TIMEOUT_MS = 8000;
const ACTIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SubscriptionStatus = {
  /** Stripe subscription status, "none" if never subscribed, "unknown" if unreachable. */
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingState = SubscriptionStatus & {
  /** User.billingRequired: true for self-signups, false for free accounts. */
  required: boolean;
  hasAccess: boolean;
  /** Individual price, or the admin-set Entreprise price for this account. */
  priceLabel: string;
};

const UNKNOWN: SubscriptionStatus = { status: "unknown", currentPeriodEnd: null, cancelAtPeriodEnd: false };

// Single-user desktop process: a tiny in-memory cache avoids a network
// round-trip on every page while a subscription is known to be active.
const activeCache = new Map<string, { value: SubscriptionStatus; expiresAt: number }>();

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>; // narrowed to object above
  return typeof v.status === "string" &&
    (v.currentPeriodEnd === null || typeof v.currentPeriodEnd === "string");
}

export function grantsAccess(status: string): boolean {
  return ACCESS_STATUSES.has(status);
}

async function fetchStatus(userId: string, sessionId?: string): Promise<SubscriptionStatus> {
  const params = new URLSearchParams({ userId });
  if (sessionId) params.set("sessionId", sessionId);
  try {
    const res = await fetch(`${BILLING_API_URL}/status?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return UNKNOWN;
    const body: unknown = await res.json();
    if (!isSubscriptionStatus(body)) return UNKNOWN;
    return { ...body, cancelAtPeriodEnd: Boolean(body.cancelAtPeriodEnd) };
  } catch {
    return UNKNOWN;
  }
}

export async function getSubscriptionStatus(
  userId: string,
  options: { sessionId?: string; fresh?: boolean } = {}
): Promise<SubscriptionStatus> {
  const cached = activeCache.get(userId);
  if (!options.fresh && !options.sessionId && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = await fetchStatus(userId, options.sessionId);
  if (grantsAccess(value.status)) {
    activeCache.set(userId, { value, expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS });
  } else {
    activeCache.delete(userId);
  }
  return value;
}

/** Paying vs free (and the Entreprise price) are set by the admin in /admin/users or by self-signup. */
async function getBillingProfile(userId: string): Promise<{ required: boolean; priceLabel: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { billingRequired: true, billingCustomAmountCents: true },
  });
  const custom = user?.billingCustomAmountCents ?? null;
  return {
    required: user?.billingRequired === true,
    priceLabel: custom === null ? BILLING_PRICE_LABEL : formatYearlyPrice(custom),
  };
}

/** Cheap gate for every app page: free accounts never hit the network. */
export async function isBlockedByPaywall(userId: string): Promise<boolean> {
  if (!(await getBillingProfile(userId)).required) return false;
  const { status } = await getSubscriptionStatus(userId);
  return !grantsAccess(status) && status !== "unknown";
}

export async function getBillingState(
  userId: string,
  options: { sessionId?: string; fresh?: boolean } = {}
): Promise<BillingState> {
  const { required, priceLabel } = await getBillingProfile(userId);
  const sub = await getSubscriptionStatus(userId, options);
  // "unknown" (offline, Vercel down) never locks anyone out of their dossiers.
  const hasAccess = !required || grantsAccess(sub.status) || sub.status === "unknown";
  return { ...sub, required, hasAccess, priceLabel };
}

/** Where Stripe sends the user back: this server (desktop localhost, or the Vercel web app). */
async function localBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3456";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createCheckoutUrl(
  userId: string,
  returnPath: string
): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch(`${BILLING_API_URL}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, returnUrl: `${await localBaseUrl()}${returnPath}` }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await res.json();
    if (res.status === 409) return { error: "already_subscribed" };
    if (res.ok && typeof body === "object" && body !== null && "url" in body && typeof body.url === "string") {
      return { url: body.url };
    }
    return { error: "unavailable" };
  } catch {
    return { error: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Admin payment test (0 € Stripe Checkout, see lib/stripe-payment-test.ts)
// ---------------------------------------------------------------------------

async function postPaymentTest(payload: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${BILLING_API_URL}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
    });
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}; // narrowed to object
  } catch {
    return { error: "Le serveur de paiement (tutaide.vercel.app) est injoignable." };
  }
}

export async function startPaymentTest(userId: string, returnPath: string): Promise<{ url: string } | { error: string }> {
  const body = await postPaymentTest({ action: "start", userId, returnUrl: `${await localBaseUrl()}${returnPath}` });
  if (typeof body.url === "string") return { url: body.url };
  return { error: typeof body.error === "string" ? body.error : "Réponse inattendue du serveur de paiement." };
}

export type PaymentTestOutcome =
  | { ok: true; cardLabel: string | null }
  | { ok: false; error: string };

export async function finishPaymentTest(userId: string, sessionId: string): Promise<PaymentTestOutcome> {
  const body = await postPaymentTest({ action: "finish", userId, sessionId });
  if (body.ok === true) return { ok: true, cardLabel: typeof body.cardLabel === "string" ? body.cardLabel : null };
  return { ok: false, error: typeof body.error === "string" ? body.error : "Réponse inattendue du serveur de paiement." };
}
