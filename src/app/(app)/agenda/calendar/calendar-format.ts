import type { DayView, EntryView, IsoDate } from "@/lib/agenda/views/types";

/**
 * Formatting of the indicative views (month, compact week, day detail).
 * Dates are "YYYY-MM-DD" handled at UTC noon, like week/format.ts.
 */

function toDate(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00Z`);
}

const MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });

/** « Octobre 2026 ». */
export function monthLabel(iso: IsoDate): string {
  const text = MONTH_YEAR.format(toDate(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** First day of the month `delta` months away from the month holding `iso`. */
export function shiftMonth(iso: IsoDate, delta: number): IsoDate {
  const d = toDate(iso);
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 12));
  return shifted.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: IsoDate): number {
  return ((toDate(iso).getUTCDay() + 6) % 7) + 1;
}

/** "L", "M", "M", "J", "V", "S", "D" — with the full name for screen readers. */
export function weekdayInitial(iso: IsoDate): { readonly initial: string; readonly name: string } {
  const name = WEEKDAY.format(toDate(iso));
  return { initial: name.charAt(0).toUpperCase(), name };
}

export function dayOfMonth(iso: IsoDate): number {
  return toDate(iso).getUTCDate();
}

/** What the indicative views count and list: visits and appointments, not lunch or unavailability. */
export function isMeeting(entry: EntryView): boolean {
  return entry.source !== "BUSY" && entry.source !== "LUNCH";
}

export function meetingsOf(day: DayView): readonly EntryView[] {
  return day.entries.filter(isMeeting);
}

/** « 1 rendez-vous », « 3 rendez-vous », « Aucun rendez-vous ». */
export function meetingCount(count: number): string {
  if (count === 0) return "Aucun rendez-vous";
  return `${count} rendez-vous`;
}
