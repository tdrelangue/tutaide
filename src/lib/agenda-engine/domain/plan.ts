import type { PlannerContext } from "./context";
import { buildDays } from "./days";
import type { IsoDate } from "./model";
import { missesPrefDay, placeTasks } from "./placement";
import type { Placement } from "./placement";
import type {
  BentRule,
  Day,
  Plan,
  PlannedDay,
  RuleOptions,
  Unplaced,
} from "./planTypes";
import { PRIO_COST } from "./priority";
import { pinWarnings } from "./pins";
import { simulate } from "./simulate";
import { buildTasks } from "./tasks";

/** Default rule options: nothing relaxed, the « Souhaité » exceptions the user refused stay refused. */
export function stateRuleOptions(ctx: PlannerContext): RuleOptions {
  return { relaxed: new Set(), refused: new Set(ctx.state.refusedExceptions) };
}

const LATE_DAY_TROUBLE = 5;
const BENT_TROUBLE = 30;

function plannedDay(
  ctx: PlannerContext,
  day: Day,
  placement: Placement,
): PlannedDay {
  const reachable = simulate(ctx, day, []) !== null;
  const sim = simulate(ctx, day, placement.routes.get(day.date) ?? []);
  const items = sim?.items ?? [];
  const busy = day.blocks.some((b) => b.kind === "event" || b.kind === "held");
  return {
    date: day.date,
    items,
    blocks: day.blocks,
    km: sim && (items.length > 0 || busy) ? sim.km : 0,
    finish: sim?.finish ?? day.start,
    closed: day.closed,
    offDay: day.offDay,
    unreachable: !reachable,
  };
}

function softMisses(
  days: readonly PlannedDay[],
  opts: RuleOptions,
): BentRule[] {
  const out: BentRule[] = [];
  for (const d of days) {
    for (const { task } of d.items) {
      const pref = missesPrefDay(task, d.date);
      if (
        pref &&
        !opts.relaxed.has(pref.id) &&
        (pref.strength === "SOFT" || pref.strength === "MEDIUM")
      ) {
        out.push({ rule: pref, task, date: d.date });
      }
    }
  }
  return out;
}

/** Plan for the period: validated items stay, everything else is placed around them. */
export function solve(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  opts: RuleOptions = stateRuleOptions(ctx),
): Plan {
  const { fixed, tasks, held, invalid } = buildTasks(ctx, P0, P1, new Set());
  const days = buildDays(ctx, P0, P1, fixed, held, opts);
  const placement = placeTasks(ctx, days, tasks, opts, P1);
  const planned = days.map((d) => plannedDay(ctx, d, placement));
  const unplaced: Unplaced[] = [...invalid, ...placement.unplaced];
  return {
    from: P0,
    to: P1,
    days: planned,
    late: placement.late,
    unplaced,
    bent: placement.bent,
    postponed: placement.postponed,
    softMissed: softMisses(planned, opts),
    alerts: unplaced.filter((u) => u.priority === "MUST"),
    pinWarnings: pinWarnings(ctx, days, planned),
    totalKm: planned.reduce((s, d) => s + d.km, 0),
  };
}

/** How bad a plan is, besides kilometres: dropped items, lateness, bent rules. */
export function trouble(plan: Plan): number {
  const dropped = plan.unplaced.reduce((s, u) => s + PRIO_COST[u.priority], 0);
  const late = plan.late.reduce((s, l) => s + l.days, 0) * LATE_DAY_TROUBLE;
  return dropped + late + plan.bent.length * BENT_TROUBLE;
}
