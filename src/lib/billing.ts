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
const PAID_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OTHER_CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a paying account keeps access after a failed charge, or after its first charge date without a card. */
export const PAYMENT_GRACE_DAYS = 30;

const PAID_STATUSES = new Set(["active", "trialing"]);
/** Stripe retrying the card (past_due) or retries exhausted with the invoice open (unpaid). */
const PAYMENT_ISSUE_STATUSES = new Set(["past_due", "unpaid"]);

export type SubscriptionStatus = {
  /** Stripe subscription status, "none" if never subscribed, "unknown" if unreachable. */
  status: string;
  /** Last renewal date; for past_due/unpaid, the charge that failed. */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** Shown in the bell and the bottom-right card while an account is in its 30-day grace. */
export type PaymentReminder = {
  reason: "payment_failed" | "no_card";
  /** ISO date when access stops. */
  deadline: string;
  daysLeft: number;
};

export type BillingState = SubscriptionStatus & {
  /** User.billingRequired: true for self-signups, false for free accounts. */
  required: boolean;
  hasAccess: boolean;
  /** Individual price, or the admin-set Entreprise price for this account. */
  priceLabel: string;
  /**
   * Admin-set date of the first charge (existing clients), ISO, only while it is
   * in the future: the account keeps full access until then, even without a card.
   */
  graceUntil: string | null;
  /** Set during the 30-day grace (still has access) and after it (access stopped). */
  reminder: PaymentReminder | null;
};

const UNKNOWN: SubscriptionStatus = {
  status: "unknown",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

// Single-user desktop process: a tiny in-memory cache avoids a network
// round-trip on every page.
const statusCache = new Map<string, { value: SubscriptionStatus; expiresAt: number }>();

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>; // narrowed to object above
  return typeof v.status === "string" &&
    (v.currentPeriodEnd === null || typeof v.currentPeriodEnd === "string");
}

/** A live subscription: paid, in its deferred-start trial, or with a payment problem. */
export function grantsAccess(status: string): boolean {
  return PAID_STATUSES.has(status) || PAYMENT_ISSUE_STATUSES.has(status);
}

export function hasPaymentIssue(status: string): boolean {
  return PAYMENT_ISSUE_STATUSES.has(status);
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
    return {
      ...body,
      currentPeriodStart: typeof body.currentPeriodStart === "string" ? body.currentPeriodStart : null,
      cancelAtPeriodEnd: Boolean(body.cancelAtPeriodEnd),
    };
  } catch {
    return UNKNOWN;
  }
}

export async function getSubscriptionStatus(
  userId: string,
  options: { sessionId?: string; fresh?: boolean } = {}
): Promise<SubscriptionStatus> {
  const cached = statusCache.get(userId);
  if (!options.fresh && !options.sessionId && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = await fetchStatus(userId, options.sessionId);
  if (value.status === "unknown") {
    statusCache.delete(userId);
  } else {
    const ttl = PAID_STATUSES.has(value.status) ? PAID_CACHE_TTL_MS : OTHER_CACHE_TTL_MS;
    statusCache.set(userId, { value, expiresAt: Date.now() + ttl });
  }
  return value;
}

type BillingProfile = {
  required: boolean;
  priceLabel: string;
  /** Admin-set first charge date (existing clients), ISO, past or future. */
  startsAt: string | null;
};

/** Paying vs free (and the Entreprise price) are set by the admin in /admin/users or by self-signup. */
async function getBillingProfile(userId: string): Promise<BillingProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { billingRequired: true, billingCustomAmountCents: true, billingStartsAt: true },
  });
  const custom = user?.billingCustomAmountCents ?? null;
  return {
    required: user?.billingRequired === true,
    priceLabel: custom === null ? BILLING_PRICE_LABEL : formatYearlyPrice(custom),
    startsAt: user?.billingStartsAt?.toISOString() ?? null,
  };
}

function isBeforeStart(profile: BillingProfile, now: number): boolean {
  return profile.startsAt !== null && now < new Date(profile.startsAt).getTime();
}

/**
 * The single access rule. Paying accounts keep access before their first charge
 * date, while paid, and for 30 days after a failed charge (counted from the
 * renewal) or after their first charge date without a card. "unknown" (offline,
 * Vercel down) never locks anyone out of their dossiers.
 */
export function evaluateAccess(
  profile: BillingProfile,
  sub: SubscriptionStatus,
  now: number
): { hasAccess: boolean; reminder: PaymentReminder | null } {
  if (!profile.required || isBeforeStart(profile, now)) return { hasAccess: true, reminder: null };
  if (PAID_STATUSES.has(sub.status) || sub.status === "unknown") return { hasAccess: true, reminder: null };

  let graceStart: number | null = null;
  let reason: PaymentReminder["reason"] = "no_card";
  if (PAYMENT_ISSUE_STATUSES.has(sub.status)) {
    reason = "payment_failed";
    graceStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart).getTime() : now;
  } else if (profile.startsAt) {
    graceStart = new Date(profile.startsAt).getTime();
  }
  if (graceStart === null) return { hasAccess: false, reminder: null };

  const deadline = graceStart + PAYMENT_GRACE_DAYS * DAY_MS;
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / DAY_MS));
  return {
    hasAccess: now < deadline,
    reminder: { reason, deadline: new Date(deadline).toISOString(), daysLeft },
  };
}

/** Cheap gate for every app page: free accounts never hit the network. */
export async function isBlockedByPaywall(userId: string): Promise<boolean> {
  const profile = await getBillingProfile(userId);
  if (!profile.required || isBeforeStart(profile, Date.now())) return false;
  const sub = await getSubscriptionStatus(userId);
  return !evaluateAccess(profile, sub, Date.now()).hasAccess;
}

/** The reminder to show while the account is in its 30-day grace, else null. */
export async function getPaymentReminder(userId: string): Promise<PaymentReminder | null> {
  const profile = await getBillingProfile(userId);
  if (!profile.required || isBeforeStart(profile, Date.now())) return null;
  const sub = await getSubscriptionStatus(userId);
  const { hasAccess, reminder } = evaluateAccess(profile, sub, Date.now());
  return hasAccess ? reminder : null;
}

export async function getBillingState(
  userId: string,
  options: { sessionId?: string; fresh?: boolean } = {}
): Promise<BillingState> {
  const profile = await getBillingProfile(userId);
  const sub = await getSubscriptionStatus(userId, options);
  const now = Date.now();
  const { hasAccess, reminder } = evaluateAccess(profile, sub, now);
  return {
    ...sub,
    required: profile.required,
    hasAccess,
    priceLabel: profile.priceLabel,
    graceUntil: isBeforeStart(profile, now) ? profile.startsAt : null,
    reminder,
  };
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
