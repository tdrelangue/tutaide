"use server";

import { revalidatePath } from "next/cache";
import { fromIso } from "@/lib/agenda/bridge/dates";
import { loadPlannerState, ownerToday } from "@/lib/agenda/bridge/load";
import { applyMoves, addAppointment as addNewAppointment, movableCandidates, placeInFreeSlot, previewMoves } from "@/lib/agenda/bridge/ops/insert";
import { markItemMissed } from "@/lib/agenda/bridge/ops/missed";
import { pinBlock, setOccurrence, setRuleAnswer, unpinBlock } from "@/lib/agenda/bridge/ops/adjust";
import { validatePeriod } from "@/lib/agenda/bridge/ops/plan";
import type { Period } from "@/lib/agenda/bridge/period";
import { readConfirmations, readWeek } from "@/lib/agenda/bridge/ops/week";
import { deleteAppointment, listAppointments as loadAppointments } from "@/lib/agenda/appointments";
import type { AppointmentInput } from "@/lib/agenda/appointments";
import { buildInsertView, buildMovesPreview } from "@/lib/agenda/views/insert-view";
import { buildVisitStatus } from "@/lib/agenda/views/visit-status";
import { buildWeekView } from "@/lib/agenda/views/week-view";
import { confirmationEntries } from "@/lib/agenda/views/week-entries";
import type { PlanDeps } from "@/lib/agenda/bridge/ops/plan";
import type {
  AgendaDataResult,
  AppointmentRow,
  EntryView,
  InsertView,
  IsoDate,
  Minutes,
  MovesPreview,
  VisitStatusRow,
  WeekView,
} from "@/lib/agenda/views/types";
import {
  NOT_PLANNABLE_ERROR,
  adjustResult,
  answerSchema,
  appointmentIdSchema,
  dateSchema,
  doneResult,
  fail,
  fingerprintSchema,
  flagSchema,
  itemKeySchema,
  monthPeriod,
  movableKeysSchema,
  planDeps,
  run,
  startSchema,
  weekPeriod,
  windowSchema,
  written,
} from "./planning-support";
import type { Done } from "./planning-support";

/**
 * /agenda — planning screens. Every action resolves the MJPM on the server
 * (requireAgendaOwner), takes « today » from the server clock in the MJPM's
 * timezone (never the page's clock), calls the bridge, and returns view
 * models (lib/agenda/views/types.ts). Inputs are checked here (zod) before
 * anything is read. Failures go through failureMessage: a refusal returns its
 * message, anything unexpected a generic one, never protected-person data.
 */

const INVALID_PERIOD_ERROR = "Période invalide : indiquez deux dates, la fin après le début, sur un mois au plus.";

async function weekResult(ownerId: string, period: Period, deps: PlanDeps, withProposal: boolean): Promise<AgendaDataResult<WeekView>> {
  const read = await readWeek(ownerId, period, deps, withProposal);
  if (!read.ok) return read.reason === "INVALID_INPUT" ? fail(INVALID_PERIOD_ERROR) : fail(NOT_PLANNABLE_ERROR, read.issues);
  const data = buildWeekView({ state: read.state, from: period.from, to: period.to, proposal: read.proposal, issues: read.issues });
  return { success: true, data };
}

/** The week starting `from` (snapped to its Monday): validated and past items, no proposal, no road-time request. */
export async function getWeek(from: IsoDate): Promise<AgendaDataResult<WeekView>> {
  return run("getWeek", async ({ ownerId }) => weekResult(ownerId, weekPeriod(from), planDeps(), false));
}

/** The calendar month holding `date`, read-only: stored planning and fixed appointments, no proposal, no road-time request. */
export async function getMonth(date: IsoDate): Promise<AgendaDataResult<WeekView>> {
  return run("getMonth", async ({ ownerId }) => weekResult(ownerId, monthPeriod(date), planDeps(), false));
}

/** The same week with a fresh proposal (may take a few seconds: road times). Nothing is stored. */
export async function proposeWeek(from: IsoDate, to: IsoDate): Promise<AgendaDataResult<WeekView>> {
  return run("proposeWeek", async ({ ownerId }) => weekResult(ownerId, weekPeriod(from, to), planDeps(), true));
}

/** Validates the proposal the user saw (`fingerprint`), then returns the week again (stored planning only). */
export async function validateWeek(from: IsoDate, to: IsoDate, fingerprint: string): Promise<AgendaDataResult<WeekView>> {
  return run("validateWeek", async ({ ownerId }) => {
    const period = weekPeriod(from, to);
    const print = fingerprintSchema.parse(fingerprint);
    const deps = planDeps();
    const count = await validatePeriod(ownerId, period, print, deps);
    const week = await weekResult(ownerId, period, deps, false);
    if (!week.success) return week;
    return written(week.data, count === 0 ? "Rien de nouveau à valider." : `Semaine validée : ${count} élément${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""} au planning.`);
  });
}

/** Keeps a proposed block where the user dropped it (or chose with « Déplacer… »). */
export async function pinItem(itemKey: string, date: IsoDate, start: Minutes): Promise<Done> {
  return run("pinItem", async ({ ownerId }) => {
    const slot = { date: dateSchema.parse(date), start: startSchema.parse(start) };
    const outcome = await pinBlock(ownerId, itemKeySchema.parse(itemKey), slot, new Date());
    return adjustResult(outcome, "Ce bloc n'est plus dans la proposition. Préparez-en une nouvelle.");
  });
}

export async function unpinItem(itemKey: string): Promise<Done> {
  return run("unpinItem", async ({ ownerId }) => {
    const outcome = await unpinBlock(ownerId, itemKeySchema.parse(itemKey));
    return adjustResult(outcome, "Ce bloc n'est plus placé à la main.");
  });
}

/** « Important » question: respect, break, or null to be asked again. */
export async function answerQuestion(ruleKey: string, answer: "respect" | "break" | null): Promise<Done> {
  return run("answerQuestion", async ({ ownerId }) => {
    const outcome = await setRuleAnswer(ownerId, itemKeySchema.parse(ruleKey), { answer: answerSchema.parse(answer) });
    return adjustResult(outcome, "Cette règle n'existe plus.");
  });
}

/** « Refuser cette exception » on a « Souhaité » rule (or `false` to allow it again). */
export async function refuseException(ruleKey: string, refused: boolean): Promise<Done> {
  return run("refuseException", async ({ ownerId }) => {
    const outcome = await setRuleAnswer(ownerId, itemKeySchema.parse(ruleKey), { refused: flagSchema.parse(refused) });
    return adjustResult(outcome, "Cette règle n'existe plus.");
  });
}

/** « Pas cette fois » on a proposed visit (or `false` to undo). */
export async function skipOccurrence(occurrenceKey: string, skipped: boolean): Promise<Done> {
  return run("skipOccurrence", async ({ ownerId }) => {
    const outcome = await setOccurrence(ownerId, itemKeySchema.parse(occurrenceKey), { skipped: flagSchema.parse(skipped) }, new Date());
    return adjustResult(outcome, "Cette visite est introuvable.");
  });
}

/** « Ces rendez-vous ont-ils eu lieu ? »: validated items of the last 7 days, oldest first. */
export async function getItemsToConfirm(): Promise<AgendaDataResult<readonly EntryView[]>> {
  return run("getItemsToConfirm", async ({ ownerId }) => {
    const read = await readConfirmations(ownerId, new Date());
    if (!read.ok) return fail(NOT_PLANNABLE_ERROR, read.issues);
    return { success: true, data: confirmationEntries(read.state, read.items) };
  });
}

const MISSED_REFUSALS = {
  UNKNOWN_ITEM: "Ce rendez-vous est introuvable ou déjà traité.",
  FUTURE: "Ce rendez-vous n'a pas encore eu lieu : supprimez-le ou déplacez-le.",
  INVALID_INPUT: "Période invalide : choisissez des dates à venir, la fin après le début, sur un mois au plus.",
} as const;

/** « N'a pas eu lieu »; a missed appointment is placed again in `window` (default: next week). */
export async function markMissed(itemKey: string, window?: { from: IsoDate; to: IsoDate }): Promise<AgendaDataResult<{ readonly requeued: boolean }>> {
  return run("markMissed", async ({ ownerId }) => {
    const chosen = windowSchema.parse(window);
    const outcome = await markItemMissed(ownerId, itemKeySchema.parse(itemKey), new Date(), chosen);
    if (outcome.ok) return written({ requeued: outcome.requeued });
    if (outcome.reason === "NOT_PLANNABLE") return fail(NOT_PLANNABLE_ERROR, outcome.issues);
    return fail(MISSED_REFUSALS[outcome.reason]);
  });
}

/** « Nouveau rendez-vous » (rule 12). Nothing is created when the agenda cannot be planned yet. */
export async function addAppointment(input: AppointmentInput): Promise<AgendaDataResult<InsertView>> {
  return run("addAppointment", async ({ ownerId, actorId }) => {
    const deps = planDeps();
    const outcome = await addNewAppointment(ownerId, actorId, input, deps);
    const loaded = outcome.kind === "NEEDS_INSERT" ? await loadPlannerState(ownerId, deps.now) : null;
    const candidates = loaded?.ok ? movableCandidates(loaded.state) : [];
    const view = buildInsertView(outcome, candidates);
    return outcome.kind === "NOT_PLANNABLE" ? { success: true, data: view } : written(view);
  });
}

/** Places the new appointment in one of the free slots offered: nothing else moves. */
export async function placeInSlot(appointmentId: string, date: IsoDate, start: Minutes): Promise<Done> {
  return run("placeInSlot", async ({ ownerId }) => {
    const slot = { date: dateSchema.parse(date), start: startSchema.parse(start) };
    await placeInFreeSlot(ownerId, appointmentIdSchema.parse(appointmentId), slot, planDeps());
    return doneResult();
  });
}

/** Exactly what moving these validated items would change. */
export async function previewInsertMoves(appointmentId: string, movableKeys: readonly string[]): Promise<AgendaDataResult<MovesPreview>> {
  return run("previewInsertMoves", async ({ ownerId }) => {
    const { result, fingerprint } = await previewMoves(ownerId, appointmentIdSchema.parse(appointmentId), movableKeysSchema.parse(movableKeys), planDeps());
    return { success: true, data: buildMovesPreview(result, fingerprint) };
  });
}

export async function applyInsertMoves(appointmentId: string, movableKeys: readonly string[], fingerprint: string, confirmRemovals: boolean): Promise<Done> {
  return run("applyInsertMoves", async ({ ownerId }) => {
    const confirm = { fingerprint: fingerprintSchema.parse(fingerprint), confirmRemovals: flagSchema.parse(confirmRemovals) };
    await applyMoves(ownerId, appointmentIdSchema.parse(appointmentId), movableKeysSchema.parse(movableKeys), confirm, planDeps());
    return doneResult();
  });
}

export async function listAppointments(): Promise<AgendaDataResult<readonly AppointmentRow[]>> {
  return run("listAppointments", async ({ ownerId }) => ({ success: true, data: await loadAppointments(ownerId, new Date()) }));
}

/** Deleting cancels the validated items still to come; past ones stay as history. */
export async function removeAppointment(appointmentId: string): Promise<Done> {
  return run("removeAppointment", async ({ ownerId }) => {
    const id = appointmentIdSchema.parse(appointmentId);
    const today = fromIso(await ownerToday(ownerId, new Date()));
    if (!(await deleteAppointment(ownerId, id, today))) return fail("Rendez-vous introuvable.");
    revalidatePath("/agenda");
    return { success: true, data: { done: true as const } };
  });
}

/** « Vu le / Prévu le / Prochaine visite » for every protected person. */
export async function getVisitStatus(): Promise<AgendaDataResult<readonly VisitStatusRow[]>> {
  return run("getVisitStatus", async ({ ownerId }) => {
    const loaded = await loadPlannerState(ownerId, new Date());
    if (!loaded.ok) return fail(NOT_PLANNABLE_ERROR, loaded.issues);
    return { success: true, data: buildVisitStatus(loaded.state, loaded.issues) };
  });
}
