import { toEpochDay } from "../../agenda-engine/domain";
import type { IsoDate, IsoDow } from "../../agenda-engine/domain";

/**
 * Dates between Prisma (`@db.Date`, read as UTC midnight) and the engine
 * (ISO strings). Always UTC parts: the server timezone must never shift a day.
 */

const DAY_MS = 86_400_000;

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** UTC midnight of an ISO date. Throws RangeError on a malformed or impossible date. */
export function fromIso(iso: IsoDate): Date {
  return new Date(toEpochDay(iso) * DAY_MS);
}

/** A real calendar day in `YYYY-MM-DD` form: the regex alone lets 2026-02-31 through, fromIso rejects it. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return toIso(fromIso(value)) === value;
  } catch {
    return false;
  }
}

/** Days from `from` to `to`, both included. Only for real dates. */
export function daysInclusive(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from) + 1;
}

export function isIsoDow(value: number | null | undefined): value is IsoDow {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** The wall-clock calendar date in an IANA zone at `now`. Throws RangeError on an unknown zone or a missing part. */
export function todayIn(timezone: string, now: Date): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string): string => {
    const value = parts.find((p) => p.type === type)?.value;
    if (!value) throw new RangeError(`Missing ${type} in the formatted date`);
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}
