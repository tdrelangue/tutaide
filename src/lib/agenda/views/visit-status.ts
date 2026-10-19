import { createContext, lastSeen, nextVisitDue } from "../../agenda-engine/domain";
import type { Contact, PlannerState } from "../../agenda-engine/domain";
import type { BridgeIssue } from "../bridge/issues";
import type { VisitStatusRow } from "./types";

/**
 * « Vu le / Prévu le / Prochaine visite » of every protected person still
 * followed (a finished follow-up is left out; a paused one is listed, flagged).
 */

/** The next validated visit or appointment with the person, today included. */
function plannedOn(state: PlannerState, person: Contact): string | null {
  const dates = state.validated.filter((v) => v.date >= state.today && v.participants.includes(person.id)).map((v) => v.date);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/**
 * Persons whose last visit the bridge had to invent (none on file): their
 * mapped « last visit » is only a starting point, not a visit that happened.
 */
function unknownLastVisits(issues: readonly BridgeIssue[]): ReadonlySet<string> {
  return new Set(issues.filter((i) => i.reason === "LAST_VISIT_UNKNOWN").map((i) => i.id));
}

/** `issues`: those of the load, to tell a real last visit from the default the bridge assumed. */
export function buildVisitStatus(state: PlannerState, issues: readonly BridgeIssue[] = []): VisitStatusRow[] {
  const ctx = createContext(state);
  const unknown = unknownLastVisits(issues);
  return state.contacts
    .filter((c) => c.category === "PROTEGE" && c.status !== "ENDED")
    .map((person) => {
      const seen = lastSeen(ctx, person);
      return { person, seenOn: unknown.has(person.id) && seen.source === null ? null : seen.date };
    })
    .map(({ person, seenOn }) => ({
      personId: person.id,
      seenOn,
      plannedOn: plannedOn(state, person),
      nextDue: nextVisitDue(ctx, person),
      paused: person.status === "PAUSED",
    }));
}
