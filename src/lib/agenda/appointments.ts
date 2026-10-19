import { z } from "zod";
import { db } from "@/lib/db";
import { fromIso, isRealDate } from "./bridge/dates";
import { AgendaRefusal, rethrowAsConflict } from "./bridge/errors";
import { queuePlanning, TX_OPTIONS } from "./bridge/lock";
import type { Tx } from "./bridge/lock";

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
    place: placeChoice,
    durationMin: z.number().int().min(5, "Un rendez-vous dure au moins 5 minutes.").max(10 * 60),
    when: whenSchema,
    priority: z.enum(["LOW", "NORMAL", "HIGH", "MUST"]),
  })
  .refine((a) => windowIsValid(a.when), { message: "Période invalide : la fin doit suivre le début, sur un an au plus.", path: ["when"] });
export type AppointmentInput = z.infer<typeof appointmentSchema>;

function whenColumns(when: AppointmentInput["when"]) {
  if (when.kind === "FIXED") return { whenKind: when.kind, date: fromIso(when.date), timeMin: when.timeMin, fromDate: null, toDate: null };
  return { whenKind: when.kind, date: null, timeMin: null, fromDate: fromIso(when.from), toDate: fromIso(when.to) };
}

/** Participants and place must be this owner's: checked for a clear message (the composite keys enforce it anyway). */
async function assertOwned(ownerId: string, input: AppointmentInput): Promise<void> {
  const unique = [...new Set(input.participantIds)];
  const found = await db.agendaContact.count({ where: { ownerId, id: { in: unique } } });
  if (found !== unique.length) throw new AgendaRefusal("Un des participants n'existe plus.");
  if (input.place.kind !== "PLACE") return;
  const place = await db.agendaPlace.count({ where: { ownerId, id: input.place.placeId } });
  if (place === 0) throw new AgendaRefusal("Ce lieu n'existe plus.");
}

export async function createAppointment(ownerId: string, actorId: string, rawInput: AppointmentInput): Promise<string> {
  const input = appointmentSchema.parse(rawInput);
  await assertOwned(ownerId, input);
  const created = await db.agendaAppointment.create({
    data: {
      ownerId,
      createdById: actorId,
      title: input.title,
      placeKind: input.place.kind,
      placeId: input.place.kind === "PLACE" ? input.place.placeId : null,
      durationMin: input.durationMin,
      priority: input.priority,
      ...whenColumns(input.when),
      participants: { create: [...new Set(input.participantIds)].map((contactId) => ({ contactId })) },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Deleting an appointment cancels its validated items still to come (they stay
 * in history as « annulé ») and detaches the past ones, which remain as history.
 * False when it is not this owner's.
 */
export async function deleteAppointment(ownerId: string, appointmentId: string, today: Date): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const found = await tx.agendaAppointment.findFirst({ where: { id: appointmentId, ownerId }, select: { id: true } });
      if (!found) return false;
      await queuePlanning(tx, ownerId);
      await cancelFutureItems(tx, ownerId, appointmentId, today);
      await tx.agendaItem.updateMany({ where: { ownerId, appointmentId }, data: { appointmentId: null } });
      await tx.agendaAppointment.delete({ where: { id_ownerId: { id: appointmentId, ownerId } } });
      return true;
    }, TX_OPTIONS);
  } catch (error) {
    return rethrowAsConflict(error, "Ce rendez-vous vient d'être modifié par ailleurs. Rechargez la page.");
  }
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
