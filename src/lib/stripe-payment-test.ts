import type Stripe from "stripe";
import { db } from "./db";
import { withQuery } from "./stripe-billing";

/**
 * Admin-only end-to-end test of the payment chain, run on the Vercel side.
 *
 * Opens a real Stripe Checkout for a 0 € yearly subscription (card required,
 * nothing charged), then cancels it as soon as the admin comes back. Test
 * subscriptions carry `tutelliaTestUserId` instead of `tutelliaUserId`, so the
 * real billing search (findSubscription) never sees them.
 */

const TEST_METADATA_KEY = "tutelliaTestUserId";

export type PaymentTestStart = { url: string } | { error: string };

export type PaymentTestResult =
  | { ok: true; cardLabel: string | null; canceled: boolean }
  | { ok: false; error: string };

async function requireAdminUser(userId: string): Promise<{ email: string } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, archivedAt: true },
  });
  return user && user.role === "ADMIN" && user.archivedAt === null ? { email: user.email } : null;
}

function stripeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur Stripe inconnue";
}

export async function startPaymentTest(
  stripe: Stripe,
  userId: string,
  returnUrl: string
): Promise<PaymentTestStart> {
  const admin = await requireAdminUser(userId);
  if (!admin) return { error: "Réservé aux administrateurs." };

  const priceId = process.env.STRIPE_PRICE_INDIVIDUAL;
  if (!priceId) return { error: "STRIPE_PRICE_INDIVIDUAL n'est pas configuré sur Vercel." };

  try {
    // Same product as the real individual plan, so the Stripe page looks like the real one.
    const price = await stripe.prices.retrieve(priceId);
    const product = typeof price.product === "string" ? price.product : price.product.id;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "eur", product, unit_amount: 0, recurring: { interval: "year" } },
        },
      ],
      payment_method_collection: "always",
      client_reference_id: userId,
      customer_email: admin.email,
      subscription_data: { metadata: { [TEST_METADATA_KEY]: userId } },
      locale: "fr",
      success_url: withQuery(returnUrl, "paytest=success&session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: withQuery(returnUrl, "paytest=cancel"),
    });
    return session.url ? { url: session.url } : { error: "Stripe n'a pas renvoyé d'adresse de paiement." };
  } catch (error) {
    return { error: stripeMessage(error) };
  }
}

function cardLabel(subscription: Stripe.Subscription): string | null {
  const pm = subscription.default_payment_method;
  if (pm && typeof pm === "object" && pm.card) return `${pm.card.brand} •••• ${pm.card.last4}`;
  return null;
}

/** Confirms the test checkout completed, then cancels the 0 € subscription it created. */
export async function finishPaymentTest(
  stripe: Stripe,
  userId: string,
  sessionId: string
): Promise<PaymentTestResult> {
  if (!(await requireAdminUser(userId))) return { ok: false, error: "Réservé aux administrateurs." };
  if (!sessionId.startsWith("cs_")) return { ok: false, error: "Identifiant de session invalide." };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.default_payment_method"],
    });
    if (session.client_reference_id !== userId) return { ok: false, error: "Cette session ne correspond pas à votre compte." };
    if (session.status !== "complete") return { ok: false, error: `Paiement non terminé (statut Stripe : ${session.status}).` };

    const sub = typeof session.subscription === "object" ? session.subscription : null;
    if (!sub || sub.metadata?.[TEST_METADATA_KEY] !== userId) {
      return { ok: false, error: "Aucun abonnement de test trouvé pour cette session." };
    }
    const alreadyCanceled = sub.status === "canceled";
    if (!alreadyCanceled) await stripe.subscriptions.cancel(sub.id);
    return { ok: true, cardLabel: cardLabel(sub), canceled: true };
  } catch (error) {
    return { ok: false, error: stripeMessage(error) };
  }
}
