import { z } from "zod";
import type { IsoDate } from "@/lib/agenda-engine/domain";
import { daysInclusive, isRealDate } from "./dates";

export type Period = { readonly from: IsoDate; readonly to: IsoDate };

/** A period is planned in one go: a month at most. */
export const MAX_PERIOD_DAYS = 31;

export const isoDateSchema = z.string().refine(isRealDate, "Date invalide.");

/** Zod still runs object checks when a field failed: never hand a bad date to the day arithmetic. */
export function isOrderedWithin(from: string, to: string, maxDays: number): boolean {
  if (!isRealDate(from) || !isRealDate(to)) return false;
  const days = daysInclusive(from, to);
  return days >= 1 && days <= maxDays;
}

const periodSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((p) => isOrderedWithin(p.from, p.to, MAX_PERIOD_DAYS));

/** The period when it is two real dates, from <= to, at most MAX_PERIOD_DAYS days; otherwise null. */
export function parsePeriod(input: unknown): Period | null {
  const parsed = periodSchema.safeParse(input);
  return parsed.success ? { from: parsed.data.from, to: parsed.data.to } : null;
}
