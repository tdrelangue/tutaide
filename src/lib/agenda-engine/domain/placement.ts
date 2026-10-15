import { availWindows } from "./availability";
import type { PlannerContext } from "./context";
import { binds } from "./days";
import type { IsoDate, PrefDayRule, SlotRule } from "./model";
import type {
  BentRule,
  Day,
  LateItem,
  RuleOptions,
  Simulation,
  Task,
  Unplaced,
} from "./planTypes";
import { PRIO_RANK } from "./priority";
import { simulate } from "./simulate";
import { diffDays, isoDow } from "./time";

const MEDIUM_DAY_COST = 45;
const MEDIUM_PREF_COST = 30;
const SOFT_PREF_COST = 10;
const SOFT_CAP_COST = 15;
const OVERTIME_COST_PER_MIN = 0.5;
/**
 * 2-opt costs about L³ simulations: past this many stops a day keeps its
 * cheapest-insertion order (a full day of 15-minute visits stays fast).
 */
const TWO_OPT_MAX_STOPS = 15;
/** Below this gain (km), 2-opt stops: it avoids endless swaps on rounding noise. */
const TWO_OPT_EPSILON_KM = 0.05;

export interface Placement {
  readonly routes: ReadonlyMap<IsoDate, readonly Task[]>;
  readonly late: readonly LateItem[];
  readonly unplaced: readonly Unplaced[];
  readonly bent: readonly BentRule[];
  readonly postponed: readonly Task[];
}

/** May a « Souhaité » rule be bent for this task in this pass? Never for a low-priority item. */
const mayBend = (task: Task, allowMedium: boolean) =>
  allowMedium && task.priority !== "LOW";

/** The preferred day is missed on `day`. */
export function missesPrefDay(task: Task, date: IsoDate): PrefDayRule | null {
  const pref = task.person?.prefDay ?? null;
  return pref && pref.dow !== isoDow(date) ? pref : null;
}

function prefForbids(
  pref: PrefDayRule,
  task: Task,
  opts: RuleOptions,
  allowMedium: boolean,
): boolean {
  if (binds(pref, opts)) return true;
  return pref.strength === "MEDIUM" && !mayBend(task, allowMedium);
}

export function allowedDay(
  ctx: PlannerContext,
  task: Task,
  day: Day,
  opts: RuleOptions,
  allowMedium: boolean,
): boolean {
  if (day.closed || day.offDay) return false;
  if (day.softClosed && !mayBend(task, allowMedium)) return false;
  const pref = missesPrefDay(task, day.date);
  if (pref && prefForbids(pref, task, opts, allowMedium)) return false;
  return availWindows(ctx, task, day.date).length > 0;
}

function busyCount(day: Day): number {
  return day.blocks.filter((b) => b.kind === "event" || b.kind === "held")
    .length;
}

function capOf(day: Day, task: Task, allowMedium: boolean): number {
  const cap = day.cap ?? Infinity;
  return day.capSoft && !mayBend(task, allowMedium)
    ? Math.min(cap, day.capSoft.max)
    : cap;
}

/** The day's visit cap still leaves room for one more item. */
export function hasRoom(
  day: Day,
  task: Task,
  allowMedium: boolean,
  routeLength: number,
): boolean {
  return routeLength + busyCount(day) < capOf(day, task, allowMedium);
}

/** Cost of using this day besides the detour: soft rules, distance to the due date, moving a validated item. */
export function softCost(
  task: Task,
  day: Day,
  opts: RuleOptions,
  load: number,
): number {
  let c = day.penalty + (day.softClosed ? MEDIUM_DAY_COST : 0);
  const pref = missesPrefDay(task, day.date);
  if (pref && !opts.relaxed.has(pref.id))
    c += pref.strength === "MEDIUM" ? MEDIUM_PREF_COST : SOFT_PREF_COST;
  if (day.capCost && load >= day.capCost.max) c += SOFT_CAP_COST;
  const perDay =
    task.overdue || task.rescheduled ? 3 : task.kind === "APPT" ? 0.3 : 1;
  c += Math.abs(diffDays(day.date, task.due)) * perDay;
  if (task.originalDate !== null)
    c += Math.abs(diffDays(day.date, task.originalDate)) * 2;
  return c;
}

/** Cheapest position of `task` in a day's route (extra km), or null if it fits nowhere. */
/**
 * Cost of a tour: its kilometres plus the time spent past the wished end of
 * the day (drive home included), 1 hour of overtime weighing like 30 km.
 */
function tourCost(ctx: PlannerContext, sim: Simulation): number {
  return (
    sim.km +
    OVERTIME_COST_PER_MIN * Math.max(0, sim.finish - ctx.state.settings.dayEnd)
  );
}

/** Cheapest position of `task` in a day's route (extra cost), or null if it fits nowhere. */
export function tryInsert(
  ctx: PlannerContext,
  day: Day,
  route: readonly Task[],
  task: Task,
) {
  const base = simulate(ctx, day, route);
  if (!base) return null;
  let best: { order: readonly Task[]; delta: number } | null = null;
  for (let i = 0; i <= route.length; i++) {
    const order = [...route.slice(0, i), task, ...route.slice(i)];
    const sim = simulate(ctx, day, order);
    const delta = sim ? tourCost(ctx, sim) - tourCost(ctx, base) : Infinity;
    if (sim && (!best || delta < best.delta)) best = { order, delta };
  }
  return best;
}

function reversed(route: readonly Task[], i: number, j: number): Task[] {
  return [
    ...route.slice(0, i),
    ...route.slice(i, j + 1).reverse(),
    ...route.slice(j + 1),
  ];
}

/** First segment reversal that shortens the tour, or null. */
function improveOnce(
  ctx: PlannerContext,
  day: Day,
  route: readonly Task[],
  km: number,
) {
  for (let i = 0; i < route.length - 1; i++) {
    for (let j = i + 1; j < route.length; j++) {
      const cand = reversed(route, i, j);
      const sim = simulate(ctx, day, cand);
      if (sim && sim.km < km - TWO_OPT_EPSILON_KM)
        return { route: cand, km: sim.km };
    }
  }
  return null;
}

/** Shortens a day's tour by reversing segments while it stays feasible. */
export function twoOpt(
  ctx: PlannerContext,
  day: Day,
  route: readonly Task[],
): readonly Task[] {
  const start = simulate(ctx, day, route);
  if (!start || route.length < 3 || route.length > TWO_OPT_MAX_STOPS)
    return route;
  let best = { route, km: start.km };
  for (
    let next = improveOnce(ctx, day, best.route, best.km);
    next;
    next = improveOnce(ctx, day, best.route, best.km)
  ) {
    best = next;
  }
  return best.route;
}

interface Candidate {
  readonly day: Day;
  readonly order: readonly Task[];
  readonly cost: number;
}

/** One task being placed, against the routes built so far. */
interface Search {
  readonly ctx: PlannerContext;
  readonly routes: ReadonlyMap<IsoDate, readonly Task[]>;
  readonly task: Task;
  readonly days: readonly Day[];
  readonly opts: RuleOptions;
}

const loadOf = (s: Search, day: Day) =>
  (s.routes.get(day.date) ?? []).length + busyCount(day);

function bestDay(
  s: Search,
  days: readonly Day[],
  allowMedium: boolean,
): Candidate | null {
  let best: Candidate | null = null;
  for (const day of days) {
    const load = loadOf(s, day);
    if (!hasRoom(day, s.task, allowMedium, load - busyCount(day))) continue;
    const ins = tryInsert(s.ctx, day, s.routes.get(day.date) ?? [], s.task);
    if (!ins) continue;
    const cost = ins.delta + softCost(s.task, day, s.opts, load);
    if (!best || cost < best.cost) best = { day, order: ins.order, cost };
  }
  return best;
}

/** Which « Souhaité » rule a placement made in the bending pass actually bent. */
function bentRule(
  task: Task,
  day: Day,
  load: number,
): SlotRule | PrefDayRule | null {
  if (day.softClosed) return day.softClosed;
  if (day.capSoft && load >= day.capSoft.max) return day.capSoft.rule;
  const pref = missesPrefDay(task, day.date);
  return pref && pref.strength === "MEDIUM" ? pref : null;
}

type Outcome =
  | {
      readonly kind: "placed";
      readonly cand: Candidate;
      readonly bent: BentRule | null;
      readonly late: LateItem | null;
    }
  | { readonly kind: "postponed" }
  | { readonly kind: "unplaced"; readonly unplaced: Unplaced };

const allowed = (s: Search, medium: boolean) =>
  s.days.filter((d) => allowedDay(s.ctx, s.task, d, s.opts, medium));
const inWindow = (s: Search, list: Day[]) =>
  list.filter((d) => d.date >= s.task.earliest && d.date <= s.task.latest);

/** Second pass: bend a « Souhaité » rule rather than drop a non-low item. */
function bending(s: Search): Outcome | null {
  const cand = bestDay(s, inWindow(s, allowed(s, true)), true);
  if (!cand) return null;
  const rule = bentRule(s.task, cand.day, loadOf(s, cand.day));
  return {
    kind: "placed",
    cand,
    bent: rule && { rule, task: s.task, date: cand.day.date },
    late: null,
  };
}

/** Last resort for a regular visit: after its deadline, inside the period. */
function lateness(s: Search, P1: IsoDate): Outcome | null {
  const { task } = s;
  if (task.strict || task.latest > P1) return null;
  const cand = bestDay(
    s,
    allowed(s, false).filter((d) => d.date > task.latest),
    false,
  );
  if (!cand) return null;
  return {
    kind: "placed",
    cand,
    bent: null,
    late: {
      task,
      date: cand.day.date,
      days: diffDays(cand.day.date, task.latest),
    },
  };
}

function unplacedOutcome(task: Task): Outcome {
  const reason =
    task.kind === "APPT" || task.originalDate !== null
      ? "NO_COMMON_SLOT"
      : "NO_FREE_DAY";
  const unplaced = {
    task,
    apptId: task.apptId,
    personId: task.person?.id ?? null,
    priority: task.priority,
    reason,
  } as const;
  return { kind: "unplaced", unplaced };
}

function chooseDay(s: Search, P1: IsoDate): Outcome {
  const first = bestDay(s, inWindow(s, allowed(s, false)), false);
  if (first) return { kind: "placed", cand: first, bent: null, late: null };
  // Only regular visits are postponed quietly; a dated appointment or a moved item is reported.
  if (s.task.priority === "LOW" && !s.task.strict) return { kind: "postponed" };
  return bending(s) ?? lateness(s, P1) ?? unplacedOutcome(s.task);
}

/** Highest priority first, appointments before visits, then the tightest deadline. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  const weight = (t: Task) => (t.kind === "APPT" ? 0 : 1);
  return [...tasks].sort(
    (a, b) =>
      PRIO_RANK[b.priority] - PRIO_RANK[a.priority] ||
      weight(a) - weight(b) ||
      (a.latest < b.latest ? -1 : a.latest > b.latest ? 1 : 0),
  );
}

/** Greedy cheapest insertion, then 2-opt per day. Shared by full plans and insertions. */
export function placeTasks(
  ctx: PlannerContext,
  days: readonly Day[],
  tasks: readonly Task[],
  opts: RuleOptions,
  P1: IsoDate,
): Placement {
  const routes = new Map<IsoDate, readonly Task[]>(
    days.map((d) => [d.date, []]),
  );
  const late: LateItem[] = [];
  const unplaced: Unplaced[] = [];
  const bent: BentRule[] = [];
  const postponed: Task[] = [];
  for (const task of sortTasks(tasks)) {
    const out = chooseDay({ ctx, routes, task, days, opts }, P1);
    if (out.kind === "postponed") postponed.push(task);
    else if (out.kind === "unplaced") unplaced.push(out.unplaced);
    else {
      routes.set(out.cand.day.date, out.cand.order);
      if (out.bent) bent.push(out.bent);
      if (out.late) late.push(out.late);
    }
  }
  for (const day of days)
    routes.set(day.date, twoOpt(ctx, day, routes.get(day.date) ?? []));
  return { routes, late, unplaced, bent, postponed };
}
