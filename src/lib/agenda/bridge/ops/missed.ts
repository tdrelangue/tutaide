import { db } from "@/lib/db";
import { addDays, markMissed, nextWeek } from "@/lib/agenda-engine/domain";
import type { DateWindow, ValidatedItem } from "@/lib/agenda-engine/domain";
import { fromIso } from "../dates";
import { AgendaConflict, rethrowAsConflict } from "../errors";
import type { BridgeIssue } from "../issues";
import { lockPlanning, TX_OPTIONS } from "../lock";
import { loadPlannerState } from "../load";
import { MAX_PERIOD_DAYS, isOrderedWithin } from "../period";

/** « Ces rendez-vous ont-ils eu lieu ? » looks back this many days (D10). */
export const CONFIRM_WINDOW_DAYS = 7;

export type MissedOutcome =
  | { readonly ok: true; readonly requeued: boolean }
  | { readonly ok: false; readonly reason: "UNKNOWN_ITEM" | "FUTURE" | "INVALID_INPUT" }
  | { readonly ok: false; readonly reason: "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] };

export type ConfirmOutcome =
  | { readonly ok: true; readonly items: readonly ValidatedItem[] }
  | { readonly ok: false; readonly reason: "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] };

/** Validated items of the last days, to confirm or mark « N'a pas eu lieu ». */
export async function itemsToConfirm(ownerId: string, now: Date): Promise<ConfirmOutcome> {
  const loaded = await loadPlannerState(ownerId, now);
  if (!loaded.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: loaded.issues };
  const { today, validated } = loaded.state;
  const from = addDays(today, -CONFIRM_WINDOW_DAYS);
  return { ok: true, items: validated.filter((v) => v.date >= from && v.date <= today) };
}

/**
 * The stored row turns MISSED and its key is freed, so the same occurrence can
 * be planned and validated again. The row is changed only if it is still
 * VALIDATED (compare-and-set): a concurrent confirmation loses with a conflict.
 */
async function writeMissed(ownerId: string, version: number, itemKey: string, window: DateWindow, requeuedApptId: string | null, now: Date): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await lockPlanning(tx, ownerId, version);
      const row = await tx.agendaItem.findFirst({ where: { ownerId, itemKey, status: "VALIDATED" }, select: { id: true } });
      if (!row) throw new AgendaConflict("Ce rendez-vous a déjà été modifié. Rechargez la page.");
      const data = { status: "MISSED" as const, statusAt: now, itemKey: `MISSED:${row.id}` };
      const { count } = await tx.agendaItem.updateMany({ where: { id: row.id, ownerId, status: "VALIDATED" }, data });
      if (count !== 1) throw new AgendaConflict("Ce rendez-vous a déjà été modifié. Rechargez la page.");
      if (requeuedApptId === null) return;
      // The appointment goes back to « à placer » in the new window, or it would sit, stale, in the past.
      await tx.agendaAppointment.update({
        where: { id_ownerId: { id: requeuedApptId, ownerId } },
        data: { whenKind: "RANGE", fromDate: fromIso(window.from), toDate: fromIso(window.to), date: null, timeMin: null, version: { increment: 1 } },
      });
    }, TX_OPTIONS);
  } catch (error) {
    rethrowAsConflict(error, "Ce rendez-vous vient d'être modifié par ailleurs. Rechargez la page.");
  }
}

/** The window must be real dates, in order, within a month, and not in the past. */
function isUsableWindow(window: DateWindow, today: string): boolean {
  return window.from >= today && isOrderedWithin(window.from, window.to, MAX_PERIOD_DAYS);
}

/**
 * « N'a pas eu lieu »: a past validated item did not happen. It stays in
 * history as cancelled and no longer counts as seen, so a visit is due again
 * from the last real one; a missed appointment is placed again in `window`
 * (default: next week). A future item is refused: delete or move it instead.
 */
export async function markItemMissed(ownerId: string, itemKey: string, now: Date, window?: DateWindow): Promise<MissedOutcome> {
  const loaded = await loadPlannerState(ownerId, now);
  if (!loaded.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: loaded.issues };
  const { state } = loaded;
  const chosen = window ?? nextWeek(state.today);
  if (!isUsableWindow(chosen, state.today)) return { ok: false, reason: "INVALID_INPUT" };
  const result = markMissed(state, itemKey, state.today, chosen);
  if (!result.ok) return { ok: false, reason: result.reason };
  const item = state.validated.find((v) => v.id === itemKey);
  if (!item) return { ok: false, reason: "UNKNOWN_ITEM" };
  await writeMissed(ownerId, loaded.version, itemKey, chosen, result.requeued ? (item.apptId ?? item.id) : null, now);
  return { ok: true, requeued: result.requeued };
}
