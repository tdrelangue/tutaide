import { db } from "@/lib/db";
import { refuseExtraSeat, seatLimit } from "./billing-plan";

/**
 * The structure's account limit (its offer, or the one negotiated), checked
 * before any account is added to it or reactivated in it.
 */

export async function activeSeatCount(orgId: string): Promise<number> {
  return db.user.count({ where: { orgId, archivedAt: null } });
}

/** Null when one more active account fits, else the message to show. */
export async function refuseOverSeatLimit(orgId: string): Promise<string | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      billingRequired: true,
      billingCustomAmountCents: true,
      billingCustomMaxSeats: true,
      billingOffer: { select: { name: true, yearlyAmountCents: true, maxSeats: true } },
    },
  });
  if (!org) return "Structure introuvable";
  const limit = seatLimit(org);
  if (limit === null) return null;
  return refuseExtraSeat(await activeSeatCount(orgId), limit);
}
