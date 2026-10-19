import type { AgendaItem, Prisma } from "@prisma/client";
import type { PastItem, ValidatedItem } from "../../../agenda-engine/domain";
import { fromIso, toIso } from "../dates";
import type { BridgeIssue } from "../issues";
import { snapshotColumns, snapshotPlace } from "./place";

export type ItemInput = AgendaItem & {
  readonly participants: readonly { readonly contactId: string }[];
};

export type MappedItems = {
  readonly validated: readonly ValidatedItem[];
  readonly past: readonly PastItem[];
  readonly issues: readonly BridgeIssue[];
};

/** Once MISSED/CANCELLED the stored key is `<status>:<row id>` (frees the occurrence for a new validation); the prefix is dropped, the engine never reads the id of an item not held. */
const STATUS_PREFIX = /^(?:MISSED|CANCELLED):/;

function toValidated(row: ItemInput): ValidatedItem {
  return {
    id: row.itemKey,
    apptId: row.appointmentId,
    kind: row.kind,
    title: row.title,
    participants: row.participants.map((p) => p.contactId),
    personId: row.contactId,
    place: snapshotPlace(row.itemKey, row),
    dur: row.endMin - row.startMin,
    date: toIso(row.date),
    start: row.startMin,
    end: row.endMin,
    priority: row.priority,
    earliest: toIso(row.earliestDate),
    latest: toIso(row.latestDate),
    fixed: row.fixed,
    movable: row.movable,
    moved: row.moved,
  };
}

function toPast(row: ItemInput): PastItem {
  return {
    id: row.itemKey.replace(STATUS_PREFIX, ""),
    apptId: row.appointmentId,
    held: false,
    kind: row.kind,
    title: row.title,
    participants: row.participants.map((p) => p.contactId),
    date: toIso(row.date),
    start: row.startMin,
    end: row.endMin,
  };
}

/**
 * VALIDATED rows are the plan, MISSED rows are history (« annulé »).
 * CANCELLED rows are excluded: kept as history they would count as missed.
 */
export function mapItems(rows: readonly ItemInput[]): MappedItems {
  return {
    validated: rows.filter((r) => r.status === "VALIDATED").map(toValidated),
    past: rows.filter((r) => r.status === "MISSED").map(toPast),
    issues: [],
  };
}

/** Create input of an AgendaItem, minus its participants (the caller writes them). */
export type ItemCreateRow = Omit<
  Prisma.AgendaItemUncheckedCreateInput,
  "participants" | "date" | "earliestDate" | "latestDate" | "placePoint" | "id" | "status" | "statusAt" | "createdAt" | "updatedAt"
> & {
  readonly date: Date;
  readonly earliestDate: Date;
  readonly latestDate: Date;
  readonly placePoint: string | null;
};

export function itemRow(item: ValidatedItem, ownerId: string): ItemCreateRow {
  return {
    ownerId,
    itemKey: item.id,
    kind: item.kind,
    appointmentId: item.apptId,
    contactId: item.personId,
    title: item.title,
    ...snapshotColumns(item.place),
    date: fromIso(item.date),
    startMin: item.start,
    endMin: item.end,
    priority: item.priority,
    earliestDate: fromIso(item.earliest),
    latestDate: fromIso(item.latest),
    fixed: item.fixed,
    movable: item.movable,
    moved: item.moved,
  };
}
