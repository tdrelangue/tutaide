/**
 * What a structure pays and how many accounts it may have: a standard offer
 * chosen by OrigAI, or a negotiated price with an optional account limit.
 * Pure functions (no I/O), shared by the admin screens, the access gate and
 * the Stripe routes.
 */

export type OfferTerms = {
  readonly name: string;
  readonly yearlyAmountCents: number;
  readonly maxSeats: number | null;
};

export type OrgBillingFields = {
  readonly billingRequired: boolean;
  readonly billingOffer: OfferTerms | null;
  readonly billingCustomAmountCents: number | null;
  readonly billingCustomMaxSeats: number | null;
};

export type OrgPlan = {
  /** The offer's name, or null for a negotiated price. */
  readonly offerName: string | null;
  readonly yearlyAmountCents: number;
  /** Null = no limit. */
  readonly maxSeats: number | null;
};

/** The offer wins over specific values; null when nothing usable is set. */
export function resolveOrgPlan(org: OrgBillingFields): OrgPlan | null {
  if (org.billingOffer) {
    return {
      offerName: org.billingOffer.name,
      yearlyAmountCents: org.billingOffer.yearlyAmountCents,
      maxSeats: org.billingOffer.maxSeats,
    };
  }
  if (org.billingCustomAmountCents === null) return null;
  return { offerName: null, yearlyAmountCents: org.billingCustomAmountCents, maxSeats: org.billingCustomMaxSeats };
}

/**
 * The account limit that applies: only a paying structure has one (an offered
 * structure is not limited, whatever was typed before it became free).
 */
export function seatLimit(org: OrgBillingFields): number | null {
  if (!org.billingRequired) return null;
  return resolveOrgPlan(org)?.maxSeats ?? null;
}

/** Refusal shown when adding (or reactivating) one more account would pass the limit. */
export function refuseExtraSeat(activeSeats: number, limit: number | null): string | null {
  if (limit === null || activeSeats < limit) return null;
  const accounts = `${limit} compte${limit > 1 ? "s" : ""}`;
  return `L'abonnement de la structure est limité à ${accounts} actif${limit > 1 ? "s" : ""}, et cette limite est atteinte. Archivez un compte ou contactez OrigAI pour élargir l'abonnement.`;
}

/** "10 comptes", "Comptes illimités". */
export function seatsLabel(maxSeats: number | null): string {
  if (maxSeats === null) return "Comptes illimités";
  return `${maxSeats} compte${maxSeats > 1 ? "s" : ""}`;
}
