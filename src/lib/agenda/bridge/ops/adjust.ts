import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, buildTasks, createContext, pinTask } from "@/lib/agenda-engine/domain";
import type { Answer, IsoDate, Minutes, Priority } from "@/lib/agenda-engine/domain";
import { fromIso, isRealDate } from "../dates";
import { rethrowAsConflict } from "../errors";
import type { BridgeIssue } from "../issues";
import { loadPlannerState, ownerToday } from "../load";
import { pinRow } from "../map";

/**
 * Choices the user makes on a proposal before validating it. They are stored
 * (the proposal itself never is) so the next calculation takes them into account.
 * Every input is checked here, whatever the caller already checked.
 */

export type AdjustOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "UNKNOWN_ITEM" | "INVALID_INPUT" }
  | { readonly ok: false; readonly reason: "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] };

const UNKNOWN: AdjustOutcome = { ok: false, reason: "UNKNOWN_ITEM" };
const INVALID: AdjustOutcome = { ok: false, reason: "INVALID_INPUT" };
const DONE: AdjustOutcome = { ok: true };
/** A dragged block may come from any proposal of the coming months (the planning screen shows up to a quarter). */
export const PIN_HORIZON_DAYS = 92;
/** A visit occurrence is due within a year around today. */
const OCCURRENCE_RANGE_DAYS = 366;
const MAX_ITEM_KEY_LENGTH = 120;
/** Last start time of a day: a block lasts at least 5 minutes. */
const MAX_START_MINUTE = 1435;

const pinSchema = z.object({
  itemKey: z.string().min(1).max(MAX_ITEM_KEY_LENGTH),
  date: z.string().refine(isRealDate),
  start: z.number().int().min(0).max(MAX_START_MINUTE),
});

/**
 * « Glisser un bloc » before validation: the proposed item `itemKey` is kept
 * where the user dropped it. Its content comes from the server's own task
 * list for that day (never from the page); the slot is checked, never refused
 * (warnings are shown with the proposal). The day must be between today and
 * PIN_HORIZON_DAYS from now: a pin never extends the planning horizon.
 */
export async function pinBlock(ownerId: string, itemKey: string, slot: { date: IsoDate; start: Minutes }, now: Date): Promise<AdjustOutcome> {
  if (!pinSchema.safeParse({ itemKey, ...slot }).success) return INVALID;
  const loaded = await loadPlannerState(ownerId, now);
  if (!loaded.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: loaded.issues };
  const { state } = loaded;
  const horizon = addDays(state.today, PIN_HORIZON_DAYS);
  if (slot.date < state.today || slot.date > horizon) return INVALID;
  const set = buildTasks(createContext(state), state.today, horizon, new Set());
  const item = set.tasks.find((t) => t.id === itemKey) ?? state.pins.find((p) => p.id === itemKey);
  if (!item) return UNKNOWN;
  const pin = pinTask(state, item, slot).pins.find((p) => p.id === itemKey);
  if (!pin) return UNKNOWN;
  const row = pinRow(pin, ownerId);
  try {
    await db.agendaPin.upsert({ where: { ownerId_itemKey: { ownerId, itemKey } }, create: row, update: row });
  } catch (error) {
    rethrowAsConflict(error, "Cet élément vient d'être modifié par ailleurs. Rechargez la page.");
  }
  return DONE;
}

/** Gives the block back to the planner. */
export async function unpinBlock(ownerId: string, itemKey: string): Promise<AdjustOutcome> {
  if (typeof itemKey !== "string" || itemKey.length === 0 || itemKey.length > MAX_ITEM_KEY_LENGTH) return INVALID;
  const { count } = await db.agendaPin.deleteMany({ where: { ownerId, itemKey } });
  return count > 0 ? DONE : UNKNOWN;
}

const PREF_KEY = /^pref:(.+)$/;
const ANSWER_COLUMN = { break: "BREAK", respect: "RESPECT" } as const;

const ruleKeySchema = z.string().min(1).max(MAX_ITEM_KEY_LENGTH);
const answerChangeSchema = z.object({
  answer: z.enum(["break", "respect"]).nullable().optional(),
  refused: z.boolean().optional(),
});

/** A rule key is this owner's rule id, or `pref:<contactId>` for one of their contacts' preferred day. */
async function ownsRuleKey(ownerId: string, ruleKey: string): Promise<boolean> {
  const pref = PREF_KEY.exec(ruleKey);
  if (pref) return (await db.agendaContact.count({ where: { ownerId, id: pref[1] } })) > 0;
  return (await db.agendaRule.count({ where: { ownerId, id: ruleKey } })) > 0;
}

/**
 * Answer to an « Important » question (null = ask again), and « Refuser cette
 * exception » on a « Souhaité » rule (it then binds like an imperative one).
 */
export async function setRuleAnswer(ownerId: string, ruleKey: string, change: { answer?: Answer | null; refused?: boolean }): Promise<AdjustOutcome> {
  const key = ruleKeySchema.safeParse(ruleKey);
  const parsed = answerChangeSchema.safeParse(change);
  if (!key.success || !parsed.success) return INVALID;
  if (!(await ownsRuleKey(ownerId, key.data))) return UNKNOWN;
  const { answer, refused } = parsed.data;
  const data = {
    ...(answer !== undefined ? { answer: answer === null ? null : ANSWER_COLUMN[answer] } : {}),
    ...(refused !== undefined ? { refused } : {}),
  };
  try {
    await db.agendaRuleAnswer.upsert({ where: { ownerId_ruleKey: { ownerId, ruleKey: key.data } }, create: { ownerId, ruleKey: key.data, ...data }, update: data });
  } catch (error) {
    rethrowAsConflict(error, "Cette règle vient d'être modifiée par ailleurs. Rechargez la page.");
  }
  return DONE;
}

const OCCURRENCE_KEY = /^([a-z0-9]{20,40})@(\d{4}-\d{2}-\d{2})$/;

const occurrenceChangeSchema = z.object({
  skipped: z.boolean().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "MUST"]).nullable().optional(),
});

/**
 * « Pas cette fois » (skip) or a priority for one visit occurrence
 * `<contactId>@<due date>`. `priority: null` goes back to the person's own.
 * The due date must be a real day within a year of today.
 */
export async function setOccurrence(
  ownerId: string,
  occurrenceKey: string,
  change: { skipped?: boolean; priority?: Priority | null },
  now: Date,
): Promise<AdjustOutcome> {
  const match = OCCURRENCE_KEY.exec(occurrenceKey);
  if (!match || !isRealDate(match[2])) return UNKNOWN;
  const parsed = occurrenceChangeSchema.safeParse(change);
  if (!parsed.success) return INVALID;
  const [, contactId, due] = match;
  const today = await ownerToday(ownerId, now);
  if (due < addDays(today, -OCCURRENCE_RANGE_DAYS) || due > addDays(today, OCCURRENCE_RANGE_DAYS)) return INVALID;
  if ((await db.agendaContact.count({ where: { ownerId, id: contactId, category: "PROTEGE" } })) === 0) return UNKNOWN;
  const { skipped, priority } = parsed.data;
  const data = { ...(skipped !== undefined ? { skipped } : {}), ...(priority !== undefined ? { priority } : {}) };
  try {
    await db.agendaOccurrenceOverride.upsert({
      where: { ownerId_occurrenceKey: { ownerId, occurrenceKey } },
      create: { ownerId, occurrenceKey, contactId, dueOn: fromIso(due), ...data },
      update: data,
    });
  } catch (error) {
    rethrowAsConflict(error, "Cette personne vient d'être modifiée par ailleurs. Rechargez la page.");
  }
  return DONE;
}
