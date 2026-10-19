import type { IsoDate, PlannerState } from "../../agenda-engine/domain";

/** Small shared helpers of the view builders. */

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Lundi 19 octobre". */
export function dayLabel(date: IsoDate): string {
  const text = DAY_FORMAT.format(new Date(`${date}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A visit occurrence id: `<contactId>@<due date>`. */
export const OCCURRENCE_KEY = /^[a-z0-9]{20,40}@\d{4}-\d{2}-\d{2}$/;

/** Contact id -> full name. */
export function nameIndex(state: PlannerState): ReadonlyMap<string, string> {
  return new Map(state.contacts.map((c) => [c.id, c.name]));
}

/** Names of the participants still on file. */
export function participantNames(names: ReadonlyMap<string, string>, ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const name = names.get(id);
    return name === undefined ? [] : [name];
  });
}

/** One decimal: kilometres are shown rounded, never as 12.3456789. */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
