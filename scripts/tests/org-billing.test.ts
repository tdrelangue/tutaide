// Run: npx tsx scripts/tests/org-billing.test.ts
import assert from "node:assert/strict";
import { refuseExtraSeat, resolveOrgPlan, seatLimit, seatsLabel, type OrgBillingFields } from "../../src/lib/organizations/billing-plan";
import { evaluateAccess, type SubscriptionStatus } from "../../src/lib/billing";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const OFFER = { name: "Structure 10", yearlyAmountCents: 240_000, maxSeats: 10 };
const org = (extra: Partial<OrgBillingFields> = {}): OrgBillingFields => ({
  billingRequired: true, billingOffer: null, billingCustomAmountCents: null, billingCustomMaxSeats: null, ...extra,
});

check("a standard offer gives its price and limit", () => {
  assert.deepEqual(resolveOrgPlan(org({ billingOffer: OFFER })), { offerName: "Structure 10", yearlyAmountCents: 240_000, maxSeats: 10 });
});

check("the offer wins over leftover specific values", () => {
  const plan = resolveOrgPlan(org({ billingOffer: OFFER, billingCustomAmountCents: 1, billingCustomMaxSeats: 99 }));
  assert.equal(plan?.yearlyAmountCents, 240_000);
  assert.equal(plan?.maxSeats, 10);
});

check("a negotiated price may have no account limit", () => {
  assert.deepEqual(resolveOrgPlan(org({ billingCustomAmountCents: 180_000 })), { offerName: null, yearlyAmountCents: 180_000, maxSeats: null });
});

check("no offer and no price: no plan", () => {
  assert.equal(resolveOrgPlan(org()), null);
});

check("an offered structure has no account limit", () => {
  assert.equal(seatLimit(org({ billingRequired: false, billingOffer: OFFER })), null);
  assert.equal(seatLimit(org({ billingOffer: OFFER })), 10);
});

check("one more account is refused only once the limit is reached", () => {
  assert.equal(refuseExtraSeat(9, 10), null);
  assert.match(refuseExtraSeat(10, 10) ?? "", /limité à 10 comptes actifs/);
  assert.match(refuseExtraSeat(1, 1) ?? "", /limité à 1 compte actif,/);
  assert.equal(refuseExtraSeat(500, null), null);
});

check("seat labels", () => {
  assert.equal(seatsLabel(null), "Comptes illimités");
  assert.equal(seatsLabel(1), "1 compte");
  assert.equal(seatsLabel(12), "12 comptes");
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2027, 2, 1);
const PAYING = { required: true, startsAt: null };
const sub = (extra: Partial<SubscriptionStatus>): SubscriptionStatus => ({
  status: "past_due", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, collection: "card", paymentDueAt: null, ...extra,
});

check("an unpaid invoice gets 30 days counted from its due date, not from the renewal", () => {
  const renewal = new Date(NOW - 40 * DAY).toISOString();
  const due = new Date(NOW - 10 * DAY).toISOString();
  const result = evaluateAccess(PAYING, sub({ collection: "invoice", currentPeriodStart: renewal, paymentDueAt: due }), NOW);
  assert.equal(result.hasAccess, true);
  assert.equal(result.reminder?.daysLeft, 20);
});

check("an unpaid invoice past its due date + 30 days blocks access", () => {
  const due = new Date(NOW - 31 * DAY).toISOString();
  assert.equal(evaluateAccess(PAYING, sub({ collection: "invoice", paymentDueAt: due }), NOW).hasAccess, false);
});

check("a failed card charge still counts from the renewal", () => {
  const renewal = new Date(NOW - 31 * DAY).toISOString();
  assert.equal(evaluateAccess(PAYING, sub({ currentPeriodStart: renewal }), NOW).hasAccess, false);
});

check("an invoice-paid subscription that is active grants access", () => {
  assert.equal(evaluateAccess(PAYING, sub({ status: "active", collection: "invoice" }), NOW).hasAccess, true);
});

console.log(`\n${passed} checks passed`);
