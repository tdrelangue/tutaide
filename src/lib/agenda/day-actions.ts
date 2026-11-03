import { z } from "zod";
import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";
import { queuePlanning, TX_OPTIONS } from "./bridge/lock";
import { isRealDate } from "./bridge/dates";

/**
 * What can be done to one day of the week (Thomas, 2026-11-03):
 * - « Au bureau ce jour-là » (morning, afternoon or the day): her assistant is
 *   there that day, she wants to work with her. Only that date, unlike the
 *   weekly rules of Paramètres; « Important »: the planner keeps it free, and
 *   asks before using it.
 * - « Reprogrammer » a morning, an afternoon or the day: the validated round
 *   goes to another day as it is (same order, same hours).
 */

export const DAY_PARTS = ["MORNING", "AFTERNOON", "DAY"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.").refine(isRealDate, "Date invalide.");
export const dayPartSchema = z.enum(DAY_PARTS);
export const officeDaySchema = z.object({ date: isoDate, part: dayPartSchema.nullable() });
export const moveDaySchema = z.object({ from: isoDate, part: dayPartSchema, to: isoDate }).refine((m) => m.from !== m.to, {
  message: "Choisissez un autre jour.",
  path: ["to"],
});

const OFFICE_LABEL = "Au bureau";
const NOON = 12 * 60 + 30;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type DaySettings = { dayStartMin: number; dayEndMin: number; lunchStartMin: number | null; lunchEndMin: number | null };

/** Minutes of a part of the working day: the morning ends at lunch, the afternoon starts after it. */
export function partWindow(part: DayPart, s: DaySettings): { from: number; to: number } {
  const lunchStart = s.lunchStartMin ?? NOON;
  const lunchEnd = s.lunchEndMin ?? lunchStart;
  if (part === "MORNING") return { from: s.dayStartMin, to: lunchStart };
  if (part === "AFTERNOON") return { from: lunchEnd, to: s.dayEndMin };
  return { from: s.dayStartMin, to: s.dayEndMin };
}

async function settingsOf(ownerId: string): Promise<DaySettings> {
  const row = await db.agendaSettings.findUnique({ where: { ownerId }, select: { dayStartMin: true, dayEndMin: true, lunchStartMin: true, lunchEndMin: true } });
  if (!row) throw new AgendaRefusal("Complétez d'abord les paramètres de l'agenda.");
  return row;
}

/** The office part already set on this day, or null. */
export async function officeDayOf(ownerId: string, date: string): Promise<DayPart | null> {
  const row = await db.agendaRule.findFirst({ where: { ownerId, type: "UNAVAILABLE", dow: null, atOffice: true, fromDate: day(date), toDate: day(date) } });
  if (!row || row.fromMin === null || row.toMin === null) return null;
  const s = await settingsOf(ownerId);
  return DAY_PARTS.find((p) => partWindow(p, s).from === row.fromMin && partWindow(p, s).to === row.toMin) ?? "DAY";
}

/** Sets (or clears, with null) « Au bureau » on one date. */
export async function setOfficeDay(ownerId: string, date: string, part: DayPart | null): Promise<void> {
  const s = await settingsOf(ownerId);
  await db.$transaction(async (tx) => {
    await queuePlanning(tx, ownerId);
    await tx.agendaRule.deleteMany({ where: { ownerId, type: "UNAVAILABLE", dow: null, atOffice: true, fromDate: day(date), toDate: day(date) } });
    if (part === null) return;
    const { from, to } = partWindow(part, s);
    await tx.agendaRule.create({
      data: { ownerId, type: "UNAVAILABLE", label: OFFICE_LABEL, strength: "STRONG", dow: null, allDay: false, fromMin: from, toMin: to, atOffice: true, fromDate: day(date), toDate: day(date) },
    });
  }, TX_OPTIONS);
}

export type MoveDayReport = { moved: number; kept: number };

/**
 * Moves the validated items of a part of `from` to `to`, same hours. Fixed-time
 * appointments stay (agreed with someone: changed one by one with
 * « Modifier »), and so does anything that would overlap what `to` already holds.
 */
export async function moveDayPart(ownerId: string, from: string, part: DayPart, to: string): Promise<MoveDayReport> {
  const { from: start, to: end } = partWindow(part, await settingsOf(ownerId));
  return db.$transaction(async (tx) => {
    await queuePlanning(tx, ownerId);
    const items = await tx.agendaItem.findMany({ where: { ownerId, status: "VALIDATED", date: day(from), startMin: { gte: start, lt: end } }, select: { id: true, startMin: true, endMin: true, fixed: true } });
    const there = await tx.agendaItem.findMany({ where: { ownerId, status: "VALIDATED", date: day(to) }, select: { startMin: true, endMin: true } });
    let moved = 0;
    for (const item of items) {
      const clash = there.some((t) => t.startMin < item.endMin && t.endMin > item.startMin);
      if (item.fixed || clash) continue;
      await tx.agendaItem.update({ where: { id_ownerId: { id: item.id, ownerId } }, data: { date: day(to), moved: true } });
      moved++;
    }
    return { moved, kept: items.length - moved };
  }, TX_OPTIONS);
}
