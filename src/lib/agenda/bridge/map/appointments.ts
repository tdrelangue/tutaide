import type { AgendaAppointment } from "@prisma/client";
import type { Appointment, When } from "../../../agenda-engine/domain";
import { toIso } from "../dates";
import { found, makeIssue, mapMany, rejected } from "../issues";
import type { BridgeIssue, Many, Mapped } from "../issues";

export type AppointmentInput = AgendaAppointment & {
  readonly participants: readonly { readonly contactId: string }[];
};

function placeIdOf(row: AgendaAppointment): string | null {
  switch (row.placeKind) {
    case "HOME":
      return "home";
    case "OFFICE":
      return "office";
    case "VISIO":
      return "visio";
    case "PLACE":
      return row.placeId;
  }
}

function whenOf(row: AgendaAppointment): When | null {
  switch (row.whenKind) {
    case "FIXED":
      if (row.date === null || row.timeMin === null) return null;
      return { kind: "FIXED", date: toIso(row.date), time: row.timeMin };
    case "WEEK":
    case "RANGE":
      if (row.fromDate === null || row.toDate === null) return null;
      return { kind: row.whenKind, from: toIso(row.fromDate), to: toIso(row.toDate) };
  }
}

export function mapAppointment(row: AppointmentInput): Mapped<Appointment> {
  const placeId = placeIdOf(row);
  const when = whenOf(row);
  const issues: BridgeIssue[] = [
    ...(placeId === null ? [makeIssue("appointment", row.id, "PLACE_MISSING")] : []),
    ...(when === null ? [makeIssue("appointment", row.id, "BAD_WHEN")] : []),
  ];
  if (placeId === null || when === null) return rejected(issues);
  return found({
    id: row.id,
    title: row.title,
    participants: row.participants.map((p) => p.contactId),
    placeId,
    dur: row.durationMin,
    when,
    priority: row.priority,
  });
}

export function mapAppointments(rows: readonly AppointmentInput[]): Many<Appointment> {
  return mapMany(rows, mapAppointment);
}
