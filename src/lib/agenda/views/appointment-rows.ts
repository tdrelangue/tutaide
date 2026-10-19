import type { Prisma } from "@prisma/client";
import { toIso } from "../bridge/dates";
import type { AppointmentRow, AppointmentStatus, WhenView } from "./types";

/** The stored appointment with what its row needs: names, place label, validated items. */
export type AppointmentRecord = Prisma.AgendaAppointmentGetPayload<{
  include: {
    participants: { include: { contact: { select: { fullName: true } } } };
    place: { select: { label: true } };
    items: { select: { date: true; status: true } };
  };
}>;

const FIXED_PLACES = { HOME: "Domicile", OFFICE: "Bureau", VISIO: "Visio" } as const;
const REMOVED_PLACE = "Lieu supprimé";

function placeLabelOf(row: AppointmentRecord): string {
  return row.placeKind === "PLACE" ? (row.place?.label ?? REMOVED_PLACE) : FIXED_PLACES[row.placeKind];
}

/** The dates asked for, or null when the row has none (it cannot be shown). */
function whenOf(row: AppointmentRecord): WhenView | null {
  if (row.whenKind === "FIXED") {
    return row.date === null || row.timeMin === null ? null : { kind: "FIXED", date: toIso(row.date), timeMin: row.timeMin };
  }
  if (row.fromDate === null || row.toDate === null) return null;
  return { kind: row.whenKind, from: toIso(row.fromDate), to: toIso(row.toDate) };
}

/** The validated item that counts: the next one to come, otherwise the latest past one. */
function scheduledOf(row: AppointmentRecord, today: string): string | null {
  const dates = row.items.filter((i) => i.status === "VALIDATED").map((i) => toIso(i.date)).sort();
  return dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? null;
}

function windowEnd(when: WhenView): string {
  return when.kind === "FIXED" ? when.date : when.to;
}

/**
 * A validated item decides: still to come = prévu, past = fait. Without one the
 * appointment waits to be placed, unless its dates are over: then it never
 * happened (annulé). A missed appointment is placed again in a new window,
 * so it is « à placer » again until that window passes.
 */
function statusOf(scheduledOn: string | null, when: WhenView, today: string): AppointmentStatus {
  if (scheduledOn !== null) return scheduledOn >= today ? "PREVU" : "FAIT";
  return windowEnd(when) < today ? "ANNULE" : "A_PLACER";
}

/** Null when the row cannot be displayed (no dates). */
export function toAppointmentRow(row: AppointmentRecord, today: string): AppointmentRow | null {
  const when = whenOf(row);
  if (when === null) return null;
  const scheduledOn = scheduledOf(row, today);
  return {
    id: row.id,
    title: row.title,
    participantNames: row.participants.map((p) => p.contact.fullName),
    placeLabel: placeLabelOf(row),
    durationMin: row.durationMin,
    when,
    priority: row.priority,
    status: statusOf(scheduledOn, when, today),
    scheduledOn,
  };
}

/** The first day an appointment is about: its validated day, otherwise the start of its dates. */
function sortDate(row: AppointmentRow): string {
  if (row.scheduledOn !== null) return row.scheduledOn;
  return row.when.kind === "FIXED" ? row.when.date : row.when.from;
}

/** Soonest first. */
export function sortAppointmentRows(rows: readonly AppointmentRow[]): AppointmentRow[] {
  return [...rows].sort((a, b) => sortDate(a).localeCompare(sortDate(b)) || a.title.localeCompare(b.title, "fr"));
}
