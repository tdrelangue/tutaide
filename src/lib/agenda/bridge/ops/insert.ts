import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  addDays,
  applyInsertion,
  createContext,
  fixedConflicts,
  insertOptions,
  insertWithMoves,
  touchesValidatedPlan,
} from "@/lib/agenda-engine/domain";
import type { Appointment, InsertOption, InsertResult, PlannerContext, PlannerState, ValidatedItem } from "@/lib/agenda-engine/domain";
import { appointmentSchema, createAppointment } from "../../appointments";
import type { AppointmentInput } from "../../appointments";
import { fromIso } from "../dates";
import { AgendaConflict, AgendaUserError, rethrowAsConflict } from "../errors";
import type { BridgeIssue } from "../issues";
import { lockPlanning, TX_OPTIONS } from "../lock";
import type { Tx } from "../lock";
import { loadPlannerState } from "../load";
import { itemRow } from "../map";
import { MAX_PERIOD_DAYS, parsePeriod } from "../period";
import { travelFor } from "../travel";
import type { PlanDeps } from "./plan";

/**
 * Rule 12. Before the week is validated, a new appointment is simply added and
 * the next proposal places it by its priority. Once its dates touch the
 * validated plan, it is an « urgent » insertion: free slots first, nothing
 * moves; moves only for items the user allows, shown exactly before applying.
 */

/** Most validated items the user can allow to move in one insertion. */
export const MAX_MOVABLE = 100;

export type AddOutcome =
  | { readonly kind: "LISTED"; readonly appointmentId: string }
  | {
      readonly kind: "NEEDS_INSERT";
      readonly appointmentId: string;
      readonly options: readonly InsertOption[];
      /** Validated items overlapping a fixed time: the user decides. */
      readonly conflicts: readonly ValidatedItem[];
    }
  /** The agenda cannot be planned yet (no home, no work day…): nothing was created. */
  | { readonly kind: "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] }
  /** Created, but the planner cannot read it (see `issues`): it is on file and must be corrected. */
  | { readonly kind: "UNPLANNABLE"; readonly appointmentId: string; readonly issues: readonly BridgeIssue[] };

const NOT_PLANNABLE_MESSAGE = "L'agenda ne peut pas encore être planifié : complétez les paramètres.";
const GONE_MESSAGE = "Ce rendez-vous n'existe plus. Rechargez la page.";
const CHANGED_MESSAGE = "Le planning a changé entre-temps. Rien n'a été modifié.";
const NO_SLOT_MESSAGE = "Plus aucun créneau ne convient. Rechargez la page.";

/**
 * The validated items the user may allow to move for an urgent insertion:
 * still to come (after today) and not fixed-time, soonest first, at most
 * MAX_MOVABLE. Items of today are left out: they may already have happened.
 */
export function movableCandidates(state: PlannerState): ValidatedItem[] {
  return state.validated
    .filter((v) => v.date > state.today && !v.fixed)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start))
    .slice(0, MAX_MOVABLE);
}

type Planning = { readonly ctx: PlannerContext; readonly ap: Appointment; readonly version: number };

/** The travel period of an appointment: its own window, clamped to today and to one calculation (a month). */
function travelPeriod(ap: Appointment, today: string) {
  const window = ap.when.kind === "FIXED" ? { from: ap.when.date, to: ap.when.date } : { from: ap.when.from, to: ap.when.to };
  const from = window.from < today ? today : window.from;
  const lastDay = addDays(from, MAX_PERIOD_DAYS - 1);
  const to = window.to > lastDay ? lastDay : window.to < from ? from : window.to;
  const period = parsePeriod({ from, to });
  if (period === null) throw new AgendaUserError("Les dates de ce rendez-vous sont invalides.");
  return period;
}

async function planningFor(ownerId: string, state: PlannerState, version: number, ap: Appointment, deps: PlanDeps): Promise<Planning> {
  const travel = await travelFor(ownerId, state, travelPeriod(ap, state.today), deps);
  return { ctx: createContext(state, travel.model), ap, version };
}

async function contextFor(ownerId: string, appointmentId: string, deps: PlanDeps): Promise<Planning> {
  const loaded = await loadPlannerState(ownerId, deps.now);
  if (!loaded.ok) throw new AgendaConflict(NOT_PLANNABLE_MESSAGE);
  const ap = loaded.state.appointments.find((a) => a.id === appointmentId);
  if (!ap) throw new AgendaConflict(GONE_MESSAGE);
  return planningFor(ownerId, loaded.state, loaded.version, ap, deps);
}

/**
 * Creates the appointment and says what comes next. The agenda is read before
 * (nothing is created if it cannot be planned) and once after (the mapper may
 * refuse the new row): two reads.
 */
export async function addAppointment(ownerId: string, actorId: string, input: AppointmentInput, deps: PlanDeps): Promise<AddOutcome> {
  const parsed = appointmentSchema.parse(input);
  const before = await loadPlannerState(ownerId, deps.now);
  if (!before.ok) return { kind: "NOT_PLANNABLE", issues: before.issues };
  const appointmentId = await createAppointment(ownerId, actorId, parsed);
  const loaded = await loadPlannerState(ownerId, deps.now);
  if (!loaded.ok) return { kind: "NOT_PLANNABLE", issues: loaded.issues };
  const ap = loaded.state.appointments.find((a) => a.id === appointmentId);
  if (!ap) return { kind: "UNPLANNABLE", appointmentId, issues: loaded.issues };
  if (!touchesValidatedPlan(loaded.state, ap)) return { kind: "LISTED", appointmentId };
  const { ctx } = await planningFor(ownerId, loaded.state, loaded.version, ap, deps);
  return { kind: "NEEDS_INSERT", appointmentId, options: insertOptions(ctx, ap, ctx.state.today), conflicts: fixedConflicts(ctx, ap) };
}

async function createAddedItem(tx: Tx, ownerId: string, added: ValidatedItem): Promise<void> {
  const participants = [...new Set(added.participants)].map((contactId) => ({ contactId }));
  await tx.agendaItem.create({ data: { ...itemRow(added, ownerId), participants: { create: participants } } });
}

/** Moves (or cancels) one validated row, which must still be exactly where the user saw it. */
async function applyChange(tx: Tx, ownerId: string, change: InsertResult["changes"][number], before: readonly ValidatedItem[], now: Date): Promise<void> {
  const old = before.find((v) => v.id === change.item.id);
  if (!old) throw new AgendaConflict(CHANGED_MESSAGE);
  const where = { ownerId, itemKey: old.id, status: "VALIDATED" as const, date: fromIso(old.date), startMin: old.start };
  const data = change.to
    ? { date: fromIso(change.to.date), startMin: change.to.start, endMin: change.to.end, moved: true }
    : { status: "CANCELLED" as const, statusAt: now, itemKey: `CANCELLED:${old.id}@${old.date}@${now.getTime()}` };
  const { count } = await tx.agendaItem.updateMany({ where, data });
  if (count !== 1) throw new AgendaConflict(CHANGED_MESSAGE);
}

/** Writes the new item and the moved ones; every moved row must still be where the user saw it. */
async function writeInsertion(ownerId: string, planning: Planning, result: InsertResult, now: Date): Promise<void> {
  const { ctx, ap, version } = planning;
  const added = applyInsertion(ctx, ap, result)?.find((v) => v.id === ap.id);
  if (!added) throw new AgendaConflict(NO_SLOT_MESSAGE);
  try {
    await db.$transaction(async (tx) => {
      await lockPlanning(tx, ownerId, version);
      await createAddedItem(tx, ownerId, added);
      for (const change of result.changes) await applyChange(tx, ownerId, change, ctx.state.validated, now);
    }, TX_OPTIONS);
  } catch (error) {
    rethrowAsConflict(error, "Ce rendez-vous vient d'être placé par ailleurs. Rechargez la page.");
  }
}

/** Places the appointment in one of the free slots offered: nothing else moves. */
export async function placeInFreeSlot(ownerId: string, appointmentId: string, slot: { date: string; start: number }, deps: PlanDeps): Promise<void> {
  const planning = await contextFor(ownerId, appointmentId, deps);
  const { ctx, ap } = planning;
  const option = insertOptions(ctx, ap, ctx.state.today).find((o) => o.date === slot.date && o.start === slot.start);
  if (!option) throw new AgendaConflict("Ce créneau n'est plus libre. Choisissez-en un autre.");
  await writeInsertion(ownerId, planning, { placement: option, changes: [], bent: [] }, deps.now);
}

/** The ids the user allows to move: no duplicates, at most MAX_MOVABLE. */
function normalizeMovable(movableIds: readonly string[]): string[] {
  const unique = [...new Set(movableIds)];
  if (unique.length > MAX_MOVABLE) throw new AgendaUserError(`Vous pouvez autoriser ${MAX_MOVABLE} déplacements au plus.`);
  return unique;
}

/** What an insertion with moves would change, and its fingerprint (sent back to apply exactly that). */
export async function previewMoves(ownerId: string, appointmentId: string, movableIds: readonly string[], deps: PlanDeps) {
  const movable = normalizeMovable(movableIds);
  const { ctx, ap } = await contextFor(ownerId, appointmentId, deps);
  const result = insertWithMoves(ctx, ap, movable, ctx.state.today);
  return { result, fingerprint: insertionFingerprint(result) };
}

type SlotJson = { date: string; start: number; end: number } | null;

function slotJson(slot: { date: string; start: number; end: number } | null): SlotJson {
  return slot ? { date: slot.date, start: slot.start, end: slot.end } : null;
}

/** Stable: the same insertion always gives the same hash (fixed key order; the bent rules are part of it). */
export function insertionFingerprint(result: InsertResult): string {
  const changes = result.changes.map((c) => ({ id: c.item.id, to: slotJson(c.to) }));
  const bent = result.bent.map((b) => `${b.rule.id}|${b.task.id}|${b.date}`).sort();
  const text = JSON.stringify({ placement: slotJson(result.placement), changes, bent });
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * Applies the moves the user saw (same fingerprint) and allowed. An item that
 * no longer fits anywhere leaves the planning as « annulé » only if the user
 * explicitly confirmed it (`confirmRemovals`).
 */
export async function applyMoves(
  ownerId: string,
  appointmentId: string,
  movableIds: readonly string[],
  confirm: { fingerprint: string; confirmRemovals: boolean },
  deps: PlanDeps,
): Promise<void> {
  const movable = normalizeMovable(movableIds);
  const planning = await contextFor(ownerId, appointmentId, deps);
  const { ctx, ap } = planning;
  const result = insertWithMoves(ctx, ap, movable, ctx.state.today);
  if (!result.placement) throw new AgendaConflict("Aucun créneau trouvé, même en décalant.");
  if (insertionFingerprint(result) !== confirm.fingerprint) {
    throw new AgendaConflict("Le planning a changé depuis l'aperçu. Vérifiez à nouveau les déplacements.");
  }
  if (result.changes.some((c) => c.to === null) && !confirm.confirmRemovals) {
    throw new AgendaConflict("Un rendez-vous sortirait du planning : confirmez-le explicitement.");
  }
  await writeInsertion(ownerId, planning, result, deps.now);
}
