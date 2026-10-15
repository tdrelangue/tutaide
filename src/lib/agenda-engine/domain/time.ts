import type { IsoDate, IsoDow } from "./model";

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parsed dates: the planner converts the same few dates many times. */
const parsed = new Map<IsoDate, number>();

/** Days since 1970-01-01, computed in UTC so clock changes never shift a date. */
export function toEpochDay(date: IsoDate): number {
  const known = parsed.get(date);
  if (known !== undefined) return known;
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`Invalid ISO date: ${date}`);
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
  // Rejects impossible dates such as 2026-02-31, which Date.UTC would roll over.
  if (fromEpochDay(day) !== date)
    throw new RangeError(`Invalid ISO date: ${date}`);
  parsed.set(date, day);
  return day;
}

export function fromEpochDay(day: number): IsoDate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Adds a (possibly fractional, rounded) number of days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + Math.round(days));
}

/** a − b, in days. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function isoDow(date: IsoDate): IsoDow {
  // 1970-01-01 was a Thursday (4).
  const dow = ((((toEpochDay(date) + 3) % 7) + 7) % 7) + 1;
  return dow as IsoDow; // always 1..7 by construction
}

/** Every date from `from` to `to`, both included. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = toEpochDay(from), end = toEpochDay(to); d <= end; d++)
    out.push(fromEpochDay(d));
  return out;
}

export function minDate(dates: readonly IsoDate[]): IsoDate | null {
  return dates.reduce<IsoDate | null>(
    (best, d) => (best === null || d < best ? d : best),
    null,
  );
}

export function maxDate(dates: readonly IsoDate[]): IsoDate | null {
  return dates.reduce<IsoDate | null>(
    (best, d) => (best === null || d > best ? d : best),
    null,
  );
}
