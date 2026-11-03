import { db } from "@/lib/db";
import { apptTask } from "@/lib/agenda-engine/domain";
import type { Appointment, PlannerContext, ValidatedItem } from "@/lib/agenda-engine/domain";
import { createContext } from "@/lib/agenda-engine/domain";
import { prepareAppointmentUpdate, updateAppointmentRow } from "../../appointments";
import type { AppointmentInput } from "../../appointments";
import { fromIso } from "../dates";
import { AgendaConflict, AgendaUserError, rethrowAsConflict } from "../errors";
import { loadPlannerState } from "../load";
import { lockPlanning, queuePlanning, TX_OPTIONS } from "../lock";
import type { Tx } from "../lock";
import { itemRow } from "../map";
import { validateFixedAppointment } from "./insert";
import type { PlanDeps } from "./plan";

/**
 * « Modifier le rendez-vous » (Thomas, 2026-11-03): a longer meeting this
 * time, another room, one more person… The appointment is changed, then its
 * validated items still to come follow it:
 * - fixed date and time: the item goes there, validated;
 * - between two dates: the item keeps its day and start, with the new length,
 *   if that day is still in the dates; otherwise it is cancelled and the
 *   appointment is placed again by the next proposal.
 * A fixed appointment not validated yet is validated now, as when it is created.
 */

export type EditOutcome = {
  readonly kept: number;
  readonly cancelled: number;
  readonly validated: boolean;
  /** Validated items the new fixed time overlaps. */
  readonly conflicts: readonly ValidatedItem[];
};

const GONE_MESSAGE = "Ce rendez-vous n'existe plus. Rechargez la page.";
const NOT_PLANNABLE_MESSAGE = "L'agenda ne peut pas encore être planifié : complétez les paramètres.";

type Followed = { readonly item: ValidatedItem; readonly to: ValidatedItem | null };

/** Where each validated item to come goes; `to` null = cancelled. */
export function followAppointment(ctx: PlannerContext, ap: Appointment, items: readonly ValidatedItem[]): Followed[] {
  const task = apptTask(ctx, ap);
  if (!task) throw new AgendaUserError("Le lieu de ce rendez-vous est introuvable.");
  const common = { title: ap.title, participants: ap.participants, place: task.place, dur: ap.dur, priority: ap.priority, earliest: task.earliest, latest: task.latest };
  return items.map((item) => {
    if (ap.when.kind === "FIXED") {
      const { date, time } = ap.when;
      return { item, to: { ...item, ...common, date, start: time, end: time + ap.dur, fixed: true } };
    }
    const inside = item.date >= ap.when.from && item.date <= ap.when.to;
    return { item, to: inside ? { ...item, ...common, end: item.start + ap.dur, fixed: false } : null };
  });
}

async function writeFollowed(tx: Tx, ownerId: string, f: Followed, now: Date): Promise<void> {
  const where = { ownerId, itemKey: f.item.id, status: "VALIDATED" as const };
  const row = await tx.agendaItem.findFirst({ where, select: { id: true } });
  if (!row) throw new AgendaConflict("Le planning a changé entre-temps. Rechargez la page.");
  if (f.to === null) {
    await tx.agendaItem.update({
      where: { id_ownerId: { id: row.id, ownerId } },
      data: { status: "CANCELLED", statusAt: now, itemKey: `CANCELLED:${f.item.id}@${f.item.date}@${now.getTime()}` },
    });
    return;
  }
  const next = itemRow(f.to, ownerId);
  await tx.agendaItem.update({
    where: { id_ownerId: { id: row.id, ownerId } },
    // Owner and key stay: the same item, changed.
    data: {
      title: next.title, placeLabel: next.placeLabel, placeAddress: next.placeAddress, placePoint: next.placePoint, placeRemote: next.placeRemote,
      date: fromIso(f.to.date), startMin: next.startMin, endMin: next.endMin, priority: next.priority,
      earliestDate: next.earliestDate, latestDate: next.latestDate, fixed: next.fixed,
    },
  });
  await tx.agendaItemParticipant.deleteMany({ where: { ownerId, itemId: row.id } });
  const contactIds = [...new Set(f.to.participants)];
  await tx.agendaItemParticipant.createMany({ data: contactIds.map((contactId) => ({ ownerId, itemId: row.id, contactId })) });
}

/** Validated items of this appointment from today on (a past one is history: it stays as it was). */
function toCome(validated: readonly ValidatedItem[], appointmentId: string, today: string): ValidatedItem[] {
  return validated.filter((v) => v.apptId === appointmentId && v.date >= today);
}

function overlaps(ctx: PlannerContext, ap: Appointment): ValidatedItem[] {
  if (ap.when.kind !== "FIXED") return [];
  const { date, time } = ap.when;
  return ctx.state.validated.filter((v) => v.apptId !== ap.id && v.date === date && v.start < time + ap.dur && v.end > time);
}

export async function editAppointment(ownerId: string, appointmentId: string, input: AppointmentInput, deps: PlanDeps): Promise<EditOutcome> {
  const { input: parsed, book } = await prepareAppointmentUpdate(ownerId, input);
  try {
    const updated = await db.$transaction(async (tx) => {
      await queuePlanning(tx, ownerId);
      return updateAppointmentRow(tx, ownerId, appointmentId, parsed, book);
    }, TX_OPTIONS);
    if (!updated) throw new AgendaConflict(GONE_MESSAGE);
  } catch (error) {
    rethrowAsConflict(error, "Ce rendez-vous vient d'être modifié par ailleurs. Rechargez la page.");
  }
  const loaded = await loadPlannerState(ownerId, deps.now);
  if (!loaded.ok) throw new AgendaConflict(NOT_PLANNABLE_MESSAGE);
  const ap = loaded.state.appointments.find((a) => a.id === appointmentId);
  if (!ap) throw new AgendaConflict(GONE_MESSAGE);
  const ctx = createContext(loaded.state);
  const items = toCome(loaded.state.validated, appointmentId, loaded.state.today);
  const neverValidated = !loaded.state.validated.some((v) => v.apptId === appointmentId);
  if (items.length === 0 && ap.when.kind === "FIXED" && neverValidated) {
    const added = await validateFixedAppointment(ownerId, loaded.state, loaded.version, ap, deps);
    return { kept: 0, cancelled: 0, validated: true, conflicts: added.conflicts };
  }
  const followed = followAppointment(ctx, ap, items);
  try {
    await db.$transaction(async (tx) => {
      await lockPlanning(tx, ownerId, loaded.version);
      for (const f of followed) await writeFollowed(tx, ownerId, f, deps.now);
    }, TX_OPTIONS);
  } catch (error) {
    rethrowAsConflict(error, "Le planning a changé entre-temps. Rechargez la page.");
  }
  return {
    kept: followed.filter((f) => f.to !== null).length,
    cancelled: followed.filter((f) => f.to === null).length,
    validated: false,
    conflicts: overlaps(ctx, ap),
  };
}
