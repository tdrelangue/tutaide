import { NextResponse } from "next/server";
import { getStripe, isValidReturnUrl, isValidUserId } from "@/lib/stripe-billing";
import { finishPaymentTest, startPaymentTest } from "@/lib/stripe-payment-test";

/**
 * POST /api/billing/test
 *   { action: "start", userId, returnUrl }   -> { url } (0 € Stripe Checkout)
 *   { action: "finish", userId, sessionId }  -> { ok, cardLabel, canceled } | { ok: false, error }
 * Admin accounts only (checked against the database). Called by the desktop
 * app's server from /admin/system-config.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "STRIPE_SECRET_KEY n'est pas configuré sur Vercel." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    body = parsed as Record<string, unknown>; // checked to be a non-null object just above
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { action, userId, returnUrl, sessionId } = body;
  if (!isValidUserId(userId)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  if (action === "start" && isValidReturnUrl(returnUrl)) {
    const result = await startPaymentTest(stripe, userId, returnUrl);
    return NextResponse.json(result, { status: "url" in result ? 200 : 400 });
  }
  if (action === "finish" && typeof sessionId === "string") {
    const result = await finishPaymentTest(stripe, userId, sessionId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
}
