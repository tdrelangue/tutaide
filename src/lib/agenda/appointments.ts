import { z } from "zod";
import { seal, sealPoint } from "./sealed";
import { placeSchema } from "./validation";
import { keepNotesOnHistory } from "./notes";
import { db } from "@/lib/db";
import { fromIso, isRealDate } from "./bridge/dates";
import { ownerToday } from "./bridge/load";
import { sortAppointmentRows, toAppointmentRow } from "./views/appointment-rows";
import type { AppointmentRow } from "./views/types";
import { AgendaRefusal, rethrowAsConflict } from "./bridge/errors";
import { queuePlanning, TX_OPTIONS } from "./bridge/lock";
import type { Tx } from "./bridge/lock";
import { addressBookOf } from "./partners";
import { ensurePartnerContact, partnerOfficePlace } from "./partner-contacts";

/**
 * « Rendez-vous »: appointments to place (in a week, between two dates) or at a
 * fixed time. Every function takes the owner resolved by requireAgendaOwner.
 */

const id = z.string().regex(/^[a-z0-9]{20,40}$/, "Élément introuvable.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.").refine(isRealDate, "Date invalide.");
/** Longest window an appointment may be planned in. */
const MAX_WINDOW_DAYS = 366;

const whenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FIXED"), date: isoDate, timeMin: z.number().int().min(0).max(24 * 60 - 5) }),
  z.object({ kind: z.literal("WEEK"), from: isoDate, to: isoDate }),
  z.object({ kind: z.literal("RANGE"), from: isoDate, to: isoDate }),
]);

const placeChoice = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["HOME", "OFFICE", "VISIO"]) }),
  z.object({ kind: z.literal("PLACE"), placeId: id }),
  /** « Chez le majeur protégé »: the address on that person's file. */
  z.object({ kind: z.literal("PERSON"), personId: id }),
  /** « Au cabinet du contact »: the address of a contact of the shared address book. */
  z.object({ kind: z.literal("PARTNER"), partnerId: id }),
  /** « À l'extérieur »: an address typed for this appointment (kept as a free place). */
  z.object({ kind: z.literal("OUTSIDE"), label: z.string().trim().max(120), address: placeSchema }),
]);

function windowIsValid(when: z.infer<typeof whenSchema>): boolean {
  if (when.kind === "FIXED") return true;
  // Zod still runs this check when a field already failed: never hand fromIso a bad date.
  if (!isRealDate(when.from) || !isRealDate(when.to)) return false;
  const days = (fromIso(when.to).getTime() - fromIso(when.from).getTime()) / 86_400_000;
  return days >= 0 && days <= MAX_WINDOW_DAYS;
}

export const appointmentSchema = z
  .object({
    title: z.string().trim().min(2, "Indiquez l'objet du rendez-vous.").max(200),
    participantIds: z.array(id).max(20),
    /** Contacts of the shared address book (lawyer, notary…): they get a contact in this agenda. */
    partnerIds: z.array(id).max(20).default([]),
    place: placeChoice,
    durationMin: z.number().int().min(5, "Un rendez-vous dure au moins 5 minutes.").max(10 * 60),
    when: whenSchema,
    priority: z.enum(["LOW", "NORMAL", "HIGH", "MUST"]),
  })
  .refine((a) => windowIsValid(a.when), { message: "Période invalide : la fin doit suivre le début, sur un an au plus.", path: ["when"] });
/** What callers send (`partnerIds` may be left out); functions parse it before use. */
export type AppointmentInput = z.input<typeof appointmentSchema>;
type ParsedAppointment = z.infer<typeof appointmentSchema>;

function whenColumns(when: ParsedAppointment["when"]) {
  if (when.kind === "FIXED") return { whenKind: when.kind, date: fromIso(when.date), timeMin: when.timeMin, fromDate: null, toDate: null };
  return { whenKind: when.kind, date: null, timeMin: null, fromDate: fromIso(when.from), toDate: fromIso(when.to) };
}

/** Participants and place must be this owner's: checked for a clear message (the composite keys enforce it anyway). */
async function assertOwned(ownerId: string, input: ParsedAppointment): Promise<void> {
  const unique = [...new Set(input.participantIds)];
  const found = await db.agendaContact.count({ where: { ownerId, id: { in: unique } } });
  if (found !== unique.length) throw new AgendaRefusal("Un des participants n'existe plus.");
  if (input.place.kind !== "PLACE") return;
  const place = await db.agendaPlace.count({ where: { ownerId, id: input.place.placeId } });
  if (place === 0) throw new AgendaRefusal("Ce lieu n'existe plus.");
}

const OUTSIDE_LABEL = "À l'extérieur";

/** The stored place kind and id: a person's, a contact's and an outside address are all places (PLACE). */
async function resolvePlace(
  tx: Tx,
  ownerId: string,
  place: AppointmentInput["place"],
  partnerContacts: ReadonlyMap<string, string>,
): Promise<{ placeKind: "HOME" | "OFFICE" | "VISIO" | "PLACE"; placeId: string | null }> {
  if (place.kind === "PLACE") return { placeKind: "PLACE", placeId: place.placeId };
  if (place.kind === "PARTNER") {
    const contactId = partnerContacts.get(place.partnerId);
    if (contactId === undefined) throw new AgendaRefusal("Ajoutez ce contact aux participants pour aller à son cabinet.");
    return { placeKind: "PLACE", placeId: await partnerOfficePlace(tx, ownerId, contactId) };
  }
  if (place.kind === "PERSON") {
    const home = await tx.agendaPlace.findFirst({ where: { ownerId, contactId: place.personId, position: 0 }, select: { id: true } });
    if (!home) throw new AgendaRefusal("Cette personne n'a pas d'adresse : renseignez-la dans sa fiche, ou choisissez un autre lieu.");
    return { placeKind: "PLACE", placeId: home.id };
  }
  if (place.kind === "OUTSIDE") {
    const label = place.label === "" ? OUTSIDE_LABEL : place.label;
    const created = await tx.agendaPlace.create({
      data: { ownerId, label, address: seal(place.address.label), point: sealPoint(place.address), precision: place.address.precision },
      select: { id: true },
    });
    return { placeKind: "PLACE", placeId: created.id };
  }
  return { placeKind: place.kind, placeId: null };
}

export async function createAppointment(ownerId: string, actorId: string, rawInput: AppointmentInput): Promise<string> {
  const input = appointmentSchema.parse(rawInput);
  await assertOwned(ownerId, input);
  const book = input.partnerIds.length > 0 ? await addressBookOf(ownerId) : null;
  return db.$transaction(async (tx) => {
    const partnerContacts = new Map<string, string>();
    for (const partnerId of new Set(input.partnerIds)) {
      if (book) partnerContacts.set(partnerId, await ensurePartnerContact(tx, ownerId, book, partnerId));
    }
    const where = await resolvePlace(tx, ownerId, input.place, partnerContacts);
    const contactIds = [...new Set([...input.participantIds, ...partnerContacts.values()])];
    const created = await tx.agendaAppointment.create({
    data: {
      ownerId,
      createdById: actorId,
      title: input.title,
      ...where,
      durationMin: input.durationMin,
      priority: input.priority,
      ...whenColumns(input.when),
      participants: { create: contactIds.map((contactId) => ({ contactId })) },
    },
    select: { id: true },
    });
    return created.id;
  }, TX_OPTIONS);
}

/**
 * Deleting an appointment cancels its validated items still to come (they stay
 * in history as « annulé ») and detaches the past ones, which remain as history.
 * False when it is not this owner's.
 */
export async function deleteAppointment(ownerId: string, appointmentId: string, today: Date): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const found = await tx.agendaAppointment.findFirst({ where: { id: appointmentId, ownerId }, select: { id: true, placeId: true, place: { select: { contactId: true } } } });
      if (!found) return false;
      await queuePlanning(tx, ownerId);
      await cancelFutureItems(tx, ownerId, appointmentId, today);
      await keepNotesOnHistory(tx, ownerId, appointmentId);
      await tx.agendaItem.updateMany({ where: { ownerId, appointmentId }, data: { appointmentId: null } });
      await tx.agendaAppointment.delete({ where: { id_ownerId: { id: appointmentId, ownerId } } });
      await dropUnusedOutsidePlace(tx, ownerId, found.placeId, found.place?.contactId ?? null);
      return true;
    }, TX_OPTIONS);
  } catch (error) {
    return rethrowAsConflict(error, "Ce rendez-vous vient d'être modifié par ailleurs. Rechargez la page.");
  }
}

/** An « À l'extérieur » address belongs to its appointment: removed with it when nothing else uses it. */
async function dropUnusedOutsidePlace(tx: Tx, ownerId: string, placeId: string | null, contactId: string | null): Promise<void> {
  if (placeId === null || contactId !== null) return;
  const users = await tx.agendaAppointment.count({ where: { ownerId, placeId } });
  if (users === 0) await tx.agendaPlace.deleteMany({ where: { ownerId, id: placeId, contactId: null } });
}

async function cancelFutureItems(tx: Tx, ownerId: string, appointmentId: string, today: Date): Promise<void> {
  const future = await tx.agendaItem.findMany({
    where: { ownerId, appointmentId, status: "VALIDATED", date: { gt: today } },
    select: { id: true },
  });
  for (const item of future) {
    await tx.agendaItem.update({
      where: { id_ownerId: { id: item.id, ownerId } },
      data: { status: "CANCELLED", statusAt: new Date(), itemKey: `CANCELLED:${item.id}` },
    });
  }
}

/**
 * The « Rendez-vous » list, soonest first, with a status derived from the
 * validated planning (see views/appointment-rows.ts). `now` is the server clock:
 * « today » is taken in the owner's timezone.
 */
export async function listAppointments(ownerId: string, now: Date): Promise<AppointmentRow[]> {
  const [today, rows] = await Promise.all([
    ownerToday(ownerId, now),
    db.agendaAppointment.findMany({
      where: { ownerId },
      include: {
        participants: { include: { contact: { select: { fullName: true } } } },
        place: { select: { label: true } },
        items: { select: { date: true, status: true } },
      },
    }),
  ]);
  const mapped = rows.flatMap((row) => {
    const view = toAppointmentRow(row, today);
    return view === null ? [] : [view];
  });
  return sortAppointmentRows(mapped);
}
