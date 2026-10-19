import type { AgendaPin, Prisma } from "@prisma/client";
import type { PinnedItem } from "../../../agenda-engine/domain";
import { fromIso, toIso } from "../dates";
import { found, makeIssue, mapMany } from "../issues";
import type { Many, Mapped } from "../issues";
import { snapshotColumns, snapshotPlace } from "./place";

function toPin(row: AgendaPin, known: ReadonlySet<string>): Mapped<PinnedItem> {
  const participants = row.participantIds.filter((id) => known.has(id));
  // A deleted contact leaves a stale id behind (no foreign key): reported, not silent.
  const issues =
    participants.length < row.participantIds.length ? [makeIssue("pin", row.id, "PARTICIPANT_UNKNOWN")] : [];
  return found(
    {
      id: row.itemKey,
      kind: row.kind,
      apptId: row.appointmentId,
      personId: row.contactId,
      title: row.title,
      participants,
      place: snapshotPlace(row.itemKey, row),
      dur: row.durationMin,
      priority: row.priority,
      date: toIso(row.date),
      start: row.startMin,
    },
    issues,
  );
}

/** `knownContactIds`: participants not in it are dropped from the pin. */
export function mapPins(rows: readonly AgendaPin[], knownContactIds: readonly string[]): Many<PinnedItem> {
  const known = new Set(knownContactIds);
  return mapMany(rows, (row) => toPin(row, known));
}

/** Create input of an AgendaPin. */
export type PinCreateRow = Omit<Prisma.AgendaPinUncheckedCreateInput, "date" | "participantIds" | "placePoint" | "id" | "createdAt"> & {
  readonly date: Date;
  readonly participantIds: string[];
  readonly placePoint: string | null;
};

export function pinRow(pin: PinnedItem, ownerId: string): PinCreateRow {
  return {
    ownerId,
    itemKey: pin.id,
    kind: pin.kind,
    appointmentId: pin.apptId,
    contactId: pin.personId,
    title: pin.title,
    participantIds: [...pin.participants],
    ...snapshotColumns(pin.place),
    durationMin: pin.dur,
    priority: pin.priority,
    date: fromIso(pin.date),
    startMin: pin.start,
  };
}
