import { db } from "./db";
import { resolveOrgPlan, seatsLabel } from "./organizations/billing-plan";

/**
 * Who pays for an account, and how much. A member of a structure is covered by
 * the structure's single subscription (their own billing fields are ignored);
 * a solo account pays for itself (individual plan or admin-set price).
 */

/** Individual plan price, shown before payment so it is never a surprise. */
export const BILLING_PRICE_LABEL = process.env.BILLING_PRICE_LABEL ?? "30 € / an";

/** "1 200 € / an" for a custom yearly amount. */
export function formatYearlyPrice(amountCents: number): string {
  const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amountCents / 100);
  return `${euros} € / an`;
}

export type BillingProfile = {
  required: boolean;
  priceLabel: string;
  /** Admin-set first charge date (existing clients), ISO, past or future. */
  startsAt: string | null;
  /** "organization": the structure's subscription covers this account. */
  scope: "personal" | "organization";
  /** Structure name, or null for a solo account. */
  orgName: string | null;
  /** Can set up the payment: the account itself, or the structure's admin. */
  canPay: boolean;
  /** Who to ask when the structure has not paid (names of its admins). */
  orgAdmins: string[];
  /** The offer's name, or "10 comptes" for a negotiated price; null for a solo account. */
  planLabel: string | null;
  /** The account's email: default billing email on a structure's invoice form. */
  email: string | null;
};

const ORG_SELECT = {
  name: true,
  billingRequired: true,
  billingCustomAmountCents: true,
  billingCustomMaxSeats: true,
  billingStartsAt: true,
  billingOffer: { select: { name: true, yearlyAmountCents: true, maxSeats: true } },
  members: { where: { isOrgAdmin: true, archivedAt: null }, select: { name: true, email: true } },
} as const;

type OrgRow = {
  name: string;
  billingRequired: boolean;
  billingCustomAmountCents: number | null;
  billingCustomMaxSeats: number | null;
  billingStartsAt: Date | null;
  billingOffer: { name: string; yearlyAmountCents: number; maxSeats: number | null } | null;
  members: { name: string | null; email: string }[];
};

function orgProfile(org: OrgRow, isOrgAdmin: boolean, email: string): BillingProfile {
  const plan = resolveOrgPlan(org);
  return {
    // A paying structure with no price yet cannot be paid: it stays open until OrigAI sets one.
    required: org.billingRequired && plan !== null,
    priceLabel: plan ? formatYearlyPrice(plan.yearlyAmountCents) : BILLING_PRICE_LABEL,
    startsAt: org.billingStartsAt?.toISOString() ?? null,
    scope: "organization",
    orgName: org.name,
    canPay: isOrgAdmin,
    orgAdmins: org.members.map((m) => m.name || m.email),
    // An offer's name already says what it includes; a negotiated price shows its limit.
    planLabel: plan ? plan.offerName ?? seatsLabel(plan.maxSeats) : null,
    email,
  };
}

/** Paying vs free and the price are set by OrigAI in /admin/users (or by self-signup). */
export async function getBillingProfile(userId: string): Promise<BillingProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      billingRequired: true,
      billingCustomAmountCents: true,
      billingStartsAt: true,
      isOrgAdmin: true,
      organization: { select: ORG_SELECT },
    },
  });
  if (user?.organization) return orgProfile(user.organization, user.isOrgAdmin, user.email);
  const custom = user?.billingCustomAmountCents ?? null;
  return {
    required: user?.billingRequired === true,
    priceLabel: custom === null ? BILLING_PRICE_LABEL : formatYearlyPrice(custom),
    startsAt: user?.billingStartsAt?.toISOString() ?? null,
    scope: "personal",
    orgName: null,
    canPay: true,
    orgAdmins: [],
    planLabel: null,
    email: user?.email ?? null,
  };
}
