"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeSeatCount } from "@/lib/organizations/seats";
import { seatLimit } from "@/lib/organizations/billing-plan";

/**
 * Super-administrator (OrigAI): standard structure offers, and what each
 * structure pays (an offer, or a negotiated price with an optional account
 * limit). A change applies to the structure's next subscription; an existing
 * Stripe subscription keeps its price until it is replaced.
 */

export type BillingOfferItem = {
  id: string;
  name: string;
  yearlyAmountCents: number;
  maxSeats: number | null;
  archived: boolean;
  /** Structures currently on this offer. */
  orgCount: number;
};

export type BillingActionResult = { success: true; message?: string } | { success: false; error: string };

function failure(error: unknown): BillingActionResult {
  if (error instanceof ZodError) return { success: false, error: error.issues[0]?.message ?? "Données invalides" };
  console.error("[admin/billing]", error);
  return { success: false, error: "Erreur inattendue" };
}

function refresh(): void {
  revalidatePath("/admin/users");
}

const eurosSchema = z
  .number({ invalid_type_error: "Prix requis" })
  .finite("Prix invalide")
  .positive("Le prix doit être supérieur à 0 €")
  .max(1_000_000, "Prix trop élevé");
const seatsSchema = z.number().int("Nombre de comptes entier").min(1, "Au moins 1 compte").max(10_000).nullable();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same window as an individual account's first charge date: 3 days to 2 years ahead. */
function parseStart(value: string | null, current: Date | null): { date: Date | null } | { error: string } {
  if (value === null) return { date: null };
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return { error: "Date de premier prélèvement invalide" };
  if (current && current.getTime() === date.getTime()) return { date };
  const ms = date.getTime() - Date.now();
  if (ms < 3 * DAY_MS) return { error: "La date de premier prélèvement doit être au moins 3 jours après aujourd'hui" };
  if (ms > 730 * DAY_MS) return { error: "La date de premier prélèvement ne peut pas dépasser 2 ans" };
  return { date };
}

function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export async function listBillingOffers(): Promise<BillingOfferItem[]> {
  await requireAdmin();
  const offers = await db.billingOffer.findMany({
    orderBy: [{ archivedAt: "asc" }, { yearlyAmountCents: "asc" }],
    select: { id: true, name: true, yearlyAmountCents: true, maxSeats: true, archivedAt: true, _count: { select: { organizations: true } } },
  });
  return offers.map((o) => ({
    id: o.id,
    name: o.name,
    yearlyAmountCents: o.yearlyAmountCents,
    maxSeats: o.maxSeats,
    archived: o.archivedAt !== null,
    orgCount: o._count.organizations,
  }));
}

const offerSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2, "Nom de l'offre requis").max(80),
  yearlyAmountEuros: eurosSchema,
  maxSeats: seatsSchema,
});

export async function saveBillingOffer(input: z.input<typeof offerSchema>): Promise<BillingActionResult> {
  try {
    await requireAdmin();
    const data = offerSchema.parse(input);
    const fields = { name: data.name, yearlyAmountCents: toCents(data.yearlyAmountEuros), maxSeats: data.maxSeats };
    if (data.id) {
      await db.billingOffer.update({ where: { id: data.id }, data: fields });
    } else {
      await db.billingOffer.create({ data: fields });
    }
    refresh();
    return { success: true, message: data.id ? "Offre modifiée" : "Offre créée" };
  } catch (error) {
    return failure(error);
  }
}

/** Archived: no longer offered to new structures; those already on it keep it. */
export async function setBillingOfferArchived(id: string, archived: boolean): Promise<BillingActionResult> {
  try {
    await requireAdmin();
    await db.billingOffer.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    refresh();
    return { success: true, message: archived ? "Offre retirée du catalogue" : "Offre remise au catalogue" };
  } catch (error) {
    return failure(error);
  }
}

const orgBillingSchema = z
  .object({
    billingRequired: z.boolean(),
    mode: z.enum(["offer", "custom"]),
    offerId: z.string().nullable(),
    customAmountEuros: eurosSchema.nullable(),
    customMaxSeats: seatsSchema,
    /** "YYYY-MM-DD" or null. */
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.billingRequired) return;
    if (value.mode === "offer" && !value.offerId) ctx.addIssue({ code: "custom", message: "Choisissez une offre" });
    if (value.mode === "custom" && value.customAmountEuros === null) ctx.addIssue({ code: "custom", message: "Indiquez le prix annuel" });
  });
export type OrgBillingInput = z.input<typeof orgBillingSchema>;

async function checkOffer(offerId: string, orgId: string): Promise<string | null> {
  const offer = await db.billingOffer.findUnique({ where: { id: offerId }, select: { archivedAt: true, organizations: { where: { id: orgId }, select: { id: true } } } });
  if (!offer) return "Offre introuvable";
  // A structure already on an archived offer may keep it; a new one cannot pick it.
  if (offer.archivedAt !== null && offer.organizations.length === 0) return "Cette offre est retirée du catalogue";
  return null;
}

/** "Attention : 12 comptes actifs pour une limite de 10…" when the new limit is already passed. */
async function overLimitNotice(orgId: string): Promise<string | undefined> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { billingRequired: true, billingCustomAmountCents: true, billingCustomMaxSeats: true, billingOffer: { select: { name: true, yearlyAmountCents: true, maxSeats: true } } },
  });
  const limit = org ? seatLimit(org) : null;
  if (limit === null) return undefined;
  const active = await activeSeatCount(orgId);
  if (active <= limit) return undefined;
  return `Enregistré. Attention : ${active} comptes actifs pour une limite de ${limit}. Aucun compte n'est bloqué, mais aucun nouveau ne pourra être ajouté.`;
}

export async function setOrganizationBilling(orgId: string, input: OrgBillingInput): Promise<BillingActionResult> {
  try {
    await requireAdmin();
    const data = orgBillingSchema.parse(input);
    const current = await db.organization.findUnique({ where: { id: orgId }, select: { billingStartsAt: true } });
    if (!current) return { success: false, error: "Structure introuvable" };
    const start = parseStart(data.billingRequired ? data.startsAt : null, current.billingStartsAt);
    if ("error" in start) return { success: false, error: start.error };
    const useOffer = data.mode === "offer" && data.offerId !== null;
    if (useOffer && data.offerId) {
      const refusal = await checkOffer(data.offerId, orgId);
      if (refusal) return { success: false, error: refusal };
    }
    await db.organization.update({
      where: { id: orgId },
      data: {
        billingRequired: data.billingRequired,
        billingOfferId: useOffer ? data.offerId : null,
        billingCustomAmountCents: !useOffer && data.customAmountEuros !== null ? toCents(data.customAmountEuros) : null,
        billingCustomMaxSeats: useOffer ? null : data.customMaxSeats,
        billingStartsAt: start.date,
      },
    });
    refresh();
    return { success: true, message: (await overLimitNotice(orgId)) ?? "Abonnement de la structure enregistré" };
  } catch (error) {
    return failure(error);
  }
}
