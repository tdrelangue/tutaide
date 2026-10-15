import type { PlannerContext } from "./context";
import type { IsoDate, SlotRule, ValidatedItem } from "./model";
import type { Block, Day, RuleOptions, Task } from "./planTypes";
import { eachDay, isoDow } from "./time";

/** Cost of working on a « Si possible » day off. */
export const SOFT_DAY_COST = 12;

type DayDraft = { -readonly [K in keyof Day]: Day[K] } & { blocks: Block[] };

/** Imperative for this solve: Impératif, Important not relaxed, or a refused « Souhaité » exception. */
export function binds(
  rule: { id: string; strength: SlotRule["strength"] },
  opts: RuleOptions,
): boolean {
  if (rule.strength === "HARD" || opts.refused.has(rule.id)) return true;
  return rule.strength === "STRONG" && !opts.relaxed.has(rule.id);
}

function applyRule(
  day: DayDraft,
  rule: SlotRule,
  ctx: PlannerContext,
  opts: RuleOptions,
): void {
  if (
    rule.type === "VACATION" ||
    (opts.relaxed.has(rule.id) && rule.strength === "STRONG")
  )
    return;
  const hard = binds(rule, opts);
  if (rule.type === "MAX_VISITS") {
    if (hard) day.cap = Math.min(day.cap ?? Infinity, rule.max);
    else if (rule.strength === "MEDIUM") day.capSoft = { max: rule.max, rule };
    else day.capCost = { max: rule.max, rule };
  } else if (!rule.allDay) {
    const place = rule.atOffice ? ctx.state.settings.office : null;
    day.blocks.push({
      s: rule.from,
      e: rule.to,
      label: rule.label,
      kind: "busy",
      place,
      ruleId: rule.id,
      task: null,
    });
  } else if (hard) {
    day.closed ??= rule;
  } else if (rule.strength === "MEDIUM") {
    day.softClosed ??= rule;
  } else {
    day.penalty += SOFT_DAY_COST;
  }
}

function eventBlock(task: Task): Block {
  const s = task.fixedStart ?? 0;
  return {
    s,
    e: s + task.dur,
    label: task.title,
    kind: "event",
    place: task.place,
    ruleId: null,
    task,
  };
}

function heldBlock(v: ValidatedItem): Block {
  return {
    s: v.start,
    e: v.end,
    label: v.title,
    kind: "held",
    place: v.place,
    ruleId: null,
    task: null,
  };
}

function buildDay(
  ctx: PlannerContext,
  date: IsoDate,
  fixed: readonly Task[],
  held: readonly ValidatedItem[],
  opts: RuleOptions,
): Day {
  const { settings, rules } = ctx.state;
  const vacation =
    rules.find(
      (r) => r.type === "VACATION" && r.from <= date && r.to >= date,
    ) ?? null;
  const day: DayDraft = {
    date,
    start: settings.dayStart,
    end: settings.dayEnd,
    offDay: !settings.workDays.includes(isoDow(date)),
    blocks: [],
    closed: vacation,
    softClosed: null,
    cap: null,
    capSoft: null,
    capCost: null,
    penalty: 0,
  };
  if (settings.lunch) {
    const [s, e] = settings.lunch;
    day.blocks.push({
      s,
      e,
      label: "Pause déjeuner",
      kind: "lunch",
      place: null,
      ruleId: null,
      task: null,
    });
  }
  const dow = isoDow(date);
  for (const rule of rules)
    if (rule.type !== "VACATION" && rule.dow === dow)
      applyRule(day, rule, ctx, opts);
  day.blocks.push(
    ...fixed.filter((f) => f.due === date).map(eventBlock),
    ...held.filter((h) => h.date === date).map(heldBlock),
  );
  day.blocks.sort((a, b) => a.s - b.s);
  return day;
}

/**
 * Working days of the period with their closures, limits and fixed blocks,
 * plus any other day holding a fixed or validated item (shown, never planned).
 */
export function buildDays(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  fixed: readonly Task[],
  held: readonly ValidatedItem[],
  opts: RuleOptions,
): Day[] {
  const busy = new Set([
    ...fixed.map((f) => f.due),
    ...held.map((h) => h.date),
  ]);
  return eachDay(P0, P1)
    .filter(
      (d) => ctx.state.settings.workDays.includes(isoDow(d)) || busy.has(d),
    )
    .map((d) => buildDay(ctx, d, fixed, held, opts));
}
