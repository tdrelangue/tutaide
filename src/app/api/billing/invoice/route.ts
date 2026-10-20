import { NextResponse } from "next/server";
import { createOrgInvoice, getStripe, isValidUserId } from "@/lib/stripe-billing";
import { invoiceDetailsSchema } from "@/lib/stripe-org-billing";

/**
 * POST /api/billing/invoice  { userId, details }
 * Called by the desktop app's server when a structure's admin chooses to pay
 * by invoice. Price, structure and payer come from the database; only the
 * billing details printed on the invoice come from the request.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const body: unknown = await request.json().catch(() => null);
  const { userId, details } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>; // shape checked just below
  const parsed = invoiceDetailsSchema.safeParse(details);
  if (!isValidUserId(userId) || !parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await createOrgInvoice(stripe, userId, parsed.data);
    if ("ok" in result) return NextResponse.json({ ok: true });
    const status = result.error === "already_subscribed" ? 409 : result.error === "not_org_admin" ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status });
  } catch (error) {
    const type = error instanceof Error ? error.name : "unknown";
    console.error("billing invoice failed:", type);
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }
}
