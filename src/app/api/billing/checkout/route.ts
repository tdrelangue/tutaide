import { NextResponse } from "next/server";
import { createCheckoutSession, getStripe, isValidReturnUrl, isValidUserId } from "@/lib/stripe-billing";

/**
 * POST /api/billing/checkout  { userId, returnUrl }
 * Called by the desktop app's server. Price and email come from the database,
 * never from the request.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { userId, returnUrl } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>; // shape checked just below
  if (!isValidUserId(userId) || !isValidReturnUrl(returnUrl)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await createCheckoutSession(stripe, userId, returnUrl);
    if ("url" in result) return NextResponse.json({ url: result.url });
    const status = result.error === "already_subscribed" ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  } catch (error) {
    const type = error instanceof Error ? error.name : "unknown";
    console.error("billing checkout failed:", type);
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }
}
