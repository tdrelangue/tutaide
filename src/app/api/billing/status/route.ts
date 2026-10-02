import { NextResponse } from "next/server";
import {
  findSubscription,
  getStripe,
  isValidUserId,
  subscriptionFromSession,
  toBillingStatus,
} from "@/lib/stripe-billing";

/**
 * GET /api/billing/status?userId=...[&sessionId=cs_...]
 * Returns { status, currentPeriodEnd, cancelAtPeriodEnd }. sessionId confirms a
 * checkout that just finished, before Stripe's search index catches up.
 */
export async function GET(request: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const userId = params.get("userId");
  if (!isValidUserId(userId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  try {
    const fromSession = await subscriptionFromSession(stripe, params.get("sessionId"), userId);
    const sub = fromSession ?? (await findSubscription(stripe, userId));
    return NextResponse.json(toBillingStatus(sub), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const type = error instanceof Error ? error.name : "unknown";
    console.error("billing status failed:", type);
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }
}
