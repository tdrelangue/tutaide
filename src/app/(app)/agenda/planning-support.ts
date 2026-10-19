import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, isoDow } from "@/lib/agenda-engine/domain";
import { requireAgendaOwner } from "@/lib/agenda/context";
import { isRealDate } from "@/lib/agenda/bridge/dates";
import { AgendaUserError } from "@/lib/agenda/bridge/errors";
import type { BridgeIssue } from "@/lib/agenda/bridge/issues";
import type { AdjustOutcome } from "@/lib/agenda/bridge/ops/adjust";
import { MAX_MOVABLE } from "@/lib/agenda/bridge/ops/insert";
import type { PlanDeps } from "@/lib/agenda/bridge/ops/plan";
import type { Period } from "@/lib/agenda/bridge/period";
import { toIssueViews } from "@/lib/agenda/views/issue-messages";
import type { AgendaDataResult, IsoDate } from "@/lib/agenda/views/types";
import { failureMessage } from "./action-errors";

/** Helpers of planning-actions.ts (a "use server" file may only export actions). */

export type Owner = { readonly ownerId: string; readonly actorId: string };
export type Done = AgendaDataResult<{ readonly done: true }>;

export const NOT_PLANNABLE_ERROR = "L'agenda ne peut pas encore être planifié : complétez les paramètres.";
const INVALID_WEEK = "Période invalide : la semaine commence un lundi et dure sept jours au plus.";
const WEEK_DAYS = 7;

// ---- inputs ---------------------------------------------------------------

const text = (message: string) => z.string({ invalid_type_error: message, required_error: message });

export const dateSchema = text("Date invalide.").refine(isRealDate, "Date invalide.");
export const appointmentIdSchema = text("Rendez-vous introuvable.").regex(/^[a-z0-9]{20,40}$/, "Rendez-vous introuvable.");
export const itemKeySchema = text("Élément introuvable.").min(1, "Élément introuvable.").max(120, "Élément introuvable.");
export const startSchema = z
  .number({ invalid_type_error: "Horaire invalide.", required_error: "Horaire invalide." })
  .int("Horaire invalide.")
  .min(0, "Horaire invalide.")
  .max(1435, "Horaire invalide.");
export const fingerprintSchema = text("Proposition invalide. Préparez-en une nouvelle.").min(1, "Proposition invalide. Préparez-en une nouvelle.").max(64, "Proposition invalide. Préparez-en une nouvelle.");
export const flagSchema = z.boolean({ invalid_type_error: "Valeur invalide.", required_error: "Valeur invalide." });
export const answerSchema = z.enum(["respect", "break"], { errorMap: () => ({ message: "Réponse invalide." }) }).nullable();
export const movableKeysSchema = z
  .array(itemKeySchema, { invalid_type_error: "Sélection invalide.", required_error: "Sélection invalide." })
  .max(MAX_MOVABLE, `Vous pouvez autoriser ${MAX_MOVABLE} déplacements au plus.`);
export const windowSchema = z.object({ from: dateSchema, to: dateSchema }, { invalid_type_error: "Période invalide.", required_error: "Période invalide." }).optional();

/** The Monday of the week holding `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoDow(date));
}

/**
 * The week the screen shows: `from` snapped to its Monday, `to` (default
 * Sunday) within that week. Anything else is refused.
 */
export function weekPeriod(from: unknown, to?: unknown): Period {
  const start = mondayOf(dateSchema.parse(from));
  const end = to === undefined ? addDays(start, WEEK_DAYS - 1) : dateSchema.parse(to);
  if (end < start || end > addDays(start, WEEK_DAYS - 1)) throw new AgendaUserError(INVALID_WEEK);
  return { from: start, to: end };
}

// ---- running an action ------------------------------------------------------

/** The server clock and `fetch`: today comes from here, never from the page. */
export function planDeps(): PlanDeps {
  return { fetch: (url, init) => globalThis.fetch(url, init), now: new Date() };
}

/** Resolves the MJPM on the server, runs the action, turns any failure into a message safe to show. */
export async function run<T>(name: string, task: (owner: Owner) => Promise<AgendaDataResult<T>>): Promise<AgendaDataResult<T>> {
  try {
    return await task(await requireAgendaOwner());
  } catch (error) {
    return { success: false, error: failureMessage(name, error) };
  }
}

// ---- results ----------------------------------------------------------------

export function fail(error: string, issues?: readonly BridgeIssue[]): { success: false; error: string; issues?: ReturnType<typeof toIssueViews> } {
  return issues === undefined ? { success: false, error } : { success: false, error, issues: toIssueViews(issues) };
}

/** A write succeeded: the agenda page is stale. */
export function written<T>(data: T, message?: string): AgendaDataResult<T> {
  revalidatePath("/agenda");
  return message === undefined ? { success: true, data } : { success: true, data, message };
}

export function doneResult(): Done {
  return written({ done: true as const });
}

/** The messages of a refused adjustment (see bridge/ops/adjust.ts). */
export function adjustResult(outcome: AdjustOutcome, unknownMessage: string): Done {
  if (outcome.ok) return doneResult();
  if (outcome.reason === "NOT_PLANNABLE") return fail(NOT_PLANNABLE_ERROR, outcome.issues);
  return fail(outcome.reason === "UNKNOWN_ITEM" ? unknownMessage : "Valeur invalide.");
}
