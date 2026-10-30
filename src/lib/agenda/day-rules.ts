import type { AgendaRule } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";

/**
 * « Mes indisponibilités »: the MJPM's recurring unavailable days or hours
 * (with how strongly they hold) and their holidays. Stored as AgendaRule rows,
 * read by the planner through bridge/map/rules.
 */

const DAY_MINUTES = 24 * 60;
const MAX_HOLIDAY_DAYS = 366;
/** Far above real use (a few weekly rules and a few holidays a year): guards against runaway data. */
const MAX_RULES_PER_OWNER = 200;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const label = z.string().trim().min(1, "Donnez un nom à ce créneau.").max(80, "Nom trop long (80 caractères au plus).");

const unavailableSchema = z
  .object({
    type: z.literal("UNAVAILABLE"),
    label,
    strength: z.enum(["HARD", "STRONG", "MEDIUM", "SOFT"]),
    dow: z.number().int().min(1).max(7),
    allDay: z.boolean(),
    fromMin: z.number().int().min(0).max(DAY_MINUTES).nullable(),
    toMin: z.number().int().min(0).max(DAY_MINUTES).nullable(),
    atOffice: z.boolean(),
  })
  .refine((r) => r.allDay || (r.fromMin !== null && r.toMin !== null && r.fromMin < r.toMin), {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ["toMin"],
  });

const vacationSchema = z
  .object({ type: z.literal("VACATION"), label, from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, { message: "La date de fin doit être après la date de début.", path: ["to"] })
  .refine((r) => daysBetween(r.from, r.to) < MAX_HOLIDAY_DAYS, { message: "Une période de vacances dure moins d'un an.", path: ["to"] });

export const dayRuleSchema = z.union([unavailableSchema, vacationSchema]);
export type DayRuleInput = z.infer<typeof dayRuleSchema>;

export const ruleIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/, "Créneau introuvable.");

export type DayRuleView =
  | (Extract<DayRuleInput, { type: "UNAVAILABLE" }> & { id: string })
  | (Extract<DayRuleInput, { type: "VACATION" }> & { id: string });

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date): string => date.toISOString().slice(0, 10);

function toView(row: AgendaRule): DayRuleView | null {
  if (row.type === "VACATION") {
    if (!row.fromDate || !row.toDate) return null;
    return { id: row.id, type: "VACATION", label: row.label, from: toIso(row.fromDate), to: toIso(row.toDate) };
  }
  if (row.type !== "UNAVAILABLE" || row.dow === null) return null;
  return {
    id: row.id,
    type: "UNAVAILABLE",
    label: row.label,
    strength: row.strength,
    dow: row.dow,
    allDay: row.allDay === true,
    fromMin: row.allDay ? null : row.fromMin,
    toMin: row.allDay ? null : row.toMin,
    atOffice: row.atOffice,
  };
}

/** Weekly rules by day then hour, then holidays by date. */
export async function listDayRules(ownerId: string): Promise<DayRuleView[]> {
  const rows = await db.agendaRule.findMany({ where: { ownerId, type: { in: ["UNAVAILABLE", "VACATION"] } }, orderBy: { createdAt: "asc" } });
  return rows
    .map(toView)
    .filter((v): v is DayRuleView => v !== null)
    .sort(byDayThenDate);
}

function sortKey(rule: DayRuleView): string {
  if (rule.type === "VACATION") return `1-${rule.from}`;
  return `0-${rule.dow}-${String(rule.fromMin ?? 0).padStart(4, "0")}`;
}

function byDayThenDate(a: DayRuleView, b: DayRuleView): number {
  return sortKey(a).localeCompare(sortKey(b));
}

function columns(input: DayRuleInput) {
  if (input.type === "VACATION") {
    // Holidays are always imperative (the planner forces HARD too).
    return { type: input.type, label: input.label, strength: "HARD" as const, dow: null, allDay: true, fromMin: null, toMin: null, atOffice: false, maxVisits: null, fromDate: toDate(input.from), toDate: toDate(input.to) };
  }
  return {
    type: input.type,
    label: input.label,
    strength: input.strength,
    dow: input.dow,
    allDay: input.allDay,
    fromMin: input.allDay ? null : input.fromMin,
    toMin: input.allDay ? null : input.toMin,
    atOffice: input.atOffice,
    maxVisits: null,
    fromDate: null,
    toDate: null,
  };
}

/** Creates (id null) or replaces one rule. False when the rule is not this owner's. */
export async function saveDayRule(ownerId: string, ruleId: string | null, input: DayRuleInput): Promise<boolean> {
  const data = columns(input);
  if (ruleId === null) {
    if ((await db.agendaRule.count({ where: { ownerId } })) >= MAX_RULES_PER_OWNER) {
      throw new AgendaRefusal(`L'agenda est limité à ${MAX_RULES_PER_OWNER} créneaux.`);
    }
    await db.agendaRule.create({ data: { ownerId, ...data } });
    return true;
  }
  return (await db.agendaRule.updateMany({ where: { id: ruleId, ownerId }, data })).count === 1;
}

/** Removes the rule and the answers given to its questions. False when it is not this owner's. */
export async function deleteDayRule(ownerId: string, ruleId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.agendaRule.deleteMany({ where: { id: ruleId, ownerId } });
    if (count === 1) await tx.agendaRuleAnswer.deleteMany({ where: { ownerId, ruleKey: ruleId } });
    return count === 1;
  });
}
