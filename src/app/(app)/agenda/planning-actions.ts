"use server";

import type { AppointmentInput } from "@/lib/agenda/appointments";
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

/**
 * /agenda — planning screens. Every action resolves the MJPM on the server
 * (requireAgendaOwner), takes « today » from the server in the MJPM's
 * timezone (never the page's clock), calls the bridge, and returns view
 * models (lib/agenda/views/types.ts). Failures go through failureMessage.
 *
 * SKELETON: bodies are implemented in the backend chunk.
 */

type Done = AgendaDataResult<{ readonly done: true }>;

function notReady<T>(): AgendaDataResult<T> {
  return { success: false, error: "Bientôt disponible." };
}

/** The week starting `from` (a Monday): validated and past items, no proposal. */
export async function getWeek(from: IsoDate): Promise<AgendaDataResult<WeekView>> {
  void from;
  return notReady();
}

/** The same week with a fresh proposal (may take a few seconds: road times). */
export async function proposeWeek(from: IsoDate, to: IsoDate): Promise<AgendaDataResult<WeekView>> {
  void from;
  void to;
  return notReady();
}

/** Validates the proposal the user saw (`fingerprint`), then returns the week again. */
export async function validateWeek(from: IsoDate, to: IsoDate, fingerprint: string): Promise<AgendaDataResult<WeekView>> {
  void from;
  void to;
  void fingerprint;
  return notReady();
}

/** Keeps a proposed block where the user dropped it (or chose with « Déplacer… »). */
export async function pinItem(itemKey: string, date: IsoDate, start: Minutes): Promise<Done> {
  void itemKey;
  void date;
  void start;
  return notReady();
}

export async function unpinItem(itemKey: string): Promise<Done> {
  void itemKey;
  return notReady();
}

/** « Important » question: respect, break, or null to be asked again. */
export async function answerQuestion(ruleKey: string, answer: "respect" | "break" | null): Promise<Done> {
  void ruleKey;
  void answer;
  return notReady();
}

/** « Refuser cette exception » on a « Souhaité » rule (or `false` to allow it again). */
export async function refuseException(ruleKey: string, refused: boolean): Promise<Done> {
  void ruleKey;
  void refused;
  return notReady();
}

/** « Pas cette fois » on a proposed visit (or `false` to undo). */
export async function skipOccurrence(occurrenceKey: string, skipped: boolean): Promise<Done> {
  void occurrenceKey;
  void skipped;
  return notReady();
}

/** « Ces rendez-vous ont-ils eu lieu ? »: validated items of the last 7 days. */
export async function getItemsToConfirm(): Promise<AgendaDataResult<readonly EntryView[]>> {
  return notReady();
}

/** « N'a pas eu lieu »; a missed appointment is placed again in `window` (default: next week). */
export async function markMissed(itemKey: string, window?: { from: IsoDate; to: IsoDate }): Promise<AgendaDataResult<{ readonly requeued: boolean }>> {
  void itemKey;
  void window;
  return notReady();
}

/** « Nouveau rendez-vous » (rule 12). */
export async function addAppointment(input: AppointmentInput): Promise<AgendaDataResult<InsertView>> {
  void input;
  return notReady();
}

/** Places the new appointment in one of the free slots offered: nothing else moves. */
export async function placeInSlot(appointmentId: string, date: IsoDate, start: Minutes): Promise<Done> {
  void appointmentId;
  void date;
  void start;
  return notReady();
}

/** Exactly what moving these validated items would change. */
export async function previewInsertMoves(appointmentId: string, movableKeys: readonly string[]): Promise<AgendaDataResult<MovesPreview>> {
  void appointmentId;
  void movableKeys;
  return notReady();
}

export async function applyInsertMoves(
  appointmentId: string,
  movableKeys: readonly string[],
  fingerprint: string,
  confirmRemovals: boolean,
): Promise<Done> {
  void appointmentId;
  void movableKeys;
  void fingerprint;
  void confirmRemovals;
  return notReady();
}

export async function listAppointments(): Promise<AgendaDataResult<readonly AppointmentRow[]>> {
  return notReady();
}

export async function removeAppointment(appointmentId: string): Promise<Done> {
  void appointmentId;
  return notReady();
}

/** « Vu le / Prévu le / Prochaine visite » for every protected person. */
export async function getVisitStatus(): Promise<AgendaDataResult<readonly VisitStatusRow[]>> {
  return notReady();
}
