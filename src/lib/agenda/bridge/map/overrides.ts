import type { AgendaOccurrenceOverride } from "@prisma/client";
import type { Priority } from "../../../agenda-engine/domain";
import { toIso } from "../dates";
import { makeIssue } from "../issues";
import type { BridgeIssue } from "../issues";

export type MappedOverrides = {
  readonly skips: readonly string[];
  readonly priorityOverrides: Readonly<Record<string, Priority>>;
  readonly issues: readonly BridgeIssue[];
};

const OCCURRENCE_KEY = /^(.+)@(\d{4}-\d{2}-\d{2})$/;

/** The key is `<contactId>@<due date>` and must agree with the row's own columns. */
function isConsistent(row: AgendaOccurrenceOverride): boolean {
  const match = OCCURRENCE_KEY.exec(row.occurrenceKey);
  return match !== null && match[1] === row.contactId && match[2] === toIso(row.dueOn);
}

function priorityEntries(rows: readonly AgendaOccurrenceOverride[]): [string, Priority][] {
  return rows.flatMap((r): [string, Priority][] => (r.priority === null ? [] : [[r.occurrenceKey, r.priority]]));
}

/** Rows with an inconsistent key are ignored and reported (BAD_KEY). */
export function mapOverrides(rows: readonly AgendaOccurrenceOverride[]): MappedOverrides {
  const good = rows.filter(isConsistent);
  return {
    skips: good.filter((r) => r.skipped).map((r) => r.occurrenceKey),
    priorityOverrides: Object.fromEntries(priorityEntries(good)),
    issues: rows.filter((r) => !isConsistent(r)).map((r) => makeIssue("override", r.occurrenceKey, "BAD_KEY")),
  };
}
