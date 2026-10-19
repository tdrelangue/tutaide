import type { InsertResult, ValidatedItem } from "../../agenda-engine/domain";
import type { AddOutcome } from "../bridge/ops/insert";
import { toIssueViews } from "./issue-messages";
import type { InsertView, ItemRef, MovesPreview } from "./types";

/** Rule 12 dialogs: what the user is shown when a new appointment touches the validated plan. */

export function itemRef(v: ValidatedItem): ItemRef {
  return { itemKey: v.id, title: v.title, date: v.date, start: v.start, fixed: v.fixed };
}

/** `candidates`: the future, movable validated items (movableCandidates), only read for NEEDS_INSERT. */
export function buildInsertView(outcome: AddOutcome, candidates: readonly ValidatedItem[]): InsertView {
  switch (outcome.kind) {
    case "LISTED":
      return { kind: "LISTED", appointmentId: outcome.appointmentId };
    case "NEEDS_INSERT":
      return {
        kind: "NEEDS_INSERT",
        appointmentId: outcome.appointmentId,
        options: outcome.options.map((o) => ({ date: o.date, start: o.start, end: o.end, addKm: o.addKm })),
        conflicts: outcome.conflicts.map(itemRef),
        candidates: candidates.map(itemRef),
      };
    case "NOT_PLANNABLE":
      return { kind: "NOT_PLANNABLE", issues: toIssueViews(outcome.issues) };
    case "UNPLANNABLE":
      return { kind: "UNPLANNABLE", appointmentId: outcome.appointmentId, issues: toIssueViews(outcome.issues) };
  }
}

/** Exactly what applying the insertion would change; `fingerprint` is sent back to apply that and nothing else. */
export function buildMovesPreview(result: InsertResult, fingerprint: string): MovesPreview {
  const { placement } = result;
  return {
    fingerprint,
    placement: placement ? { date: placement.date, start: placement.start, end: placement.end } : null,
    changes: result.changes.map((c) => ({
      itemKey: c.item.id,
      title: c.item.title,
      from: { date: c.item.date, start: c.item.start },
      to: c.to ? { date: c.to.date, start: c.to.start, end: c.to.end } : null,
    })),
    bent: [...new Set(result.bent.map((b) => b.rule.label))],
    hasRemovals: result.changes.some((c) => c.to === null),
  };
}
