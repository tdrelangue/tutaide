// Adding to a validated plan: never recompute everything, never move what the user did not allow.
import type { PlannerContext } from "./context";
import { buildDays } from "./days";
import type {
  Appointment,
  IsoDate,
  Minutes,
  PlannerState,
  ValidatedItem,
} from "./model";
import { allowedDay, hasRoom, placeTasks, tryInsert } from "./placement";
import type { BentRule, Day, Task } from "./planTypes";
import { stateRuleOptions } from "./plan";
import { simulate } from "./simulate";
import {
  apptTask,
  appointmentTasks,
  fixedEvents,
  heldItems,
  itemToTask,
} from "./tasks";
import { maxDate, minDate } from "./time";

const MAX_OPTIONS = 4;

export interface Slot {
  readonly date: IsoDate;
  readonly start: Minutes;
  readonly end: Minutes;
}
export interface InsertOption extends Slot {
  /** Extra kilometres of that day's tour. */
  readonly addKm: number;
}
export interface InsertChange {
  readonly item: ValidatedItem;
  /** null: the item no longer fits anywhere and leaves the calendar. */
  readonly to: Slot | null;
}
export interface InsertResult {
  readonly placement: Slot | null;
  readonly changes: readonly InsertChange[];
  /** « Souhaité » rules bent to fit the insertion: shown before the user applies it. */
  readonly bent: readonly BentRule[];
}

const NOTHING: InsertResult = { placement: null, changes: [], bent: [] };

function frozenDays(
  ctx: PlannerContext,
  ap: Appointment,
  P0: IsoDate,
  P1: IsoDate,
  movable: ReadonlySet<string>,
): Day[] {
  const opts = stateRuleOptions(ctx);
  const fixed = fixedEvents(ctx, P0, P1, appointmentTasks(ctx, P0, P1)).filter(
    (f) => f.id !== ap.id,
  );
  return buildDays(
    ctx,
    P0,
    P1,
    fixed,
    heldItems(ctx, P0, P1, movable).held,
    opts,
  );
}

function optionOn(
  ctx: PlannerContext,
  day: Day,
  task: Task,
): InsertOption | null {
  const base = simulate(ctx, day, []);
  const ins = base && tryInsert(ctx, day, [], task);
  const sim = ins && simulate(ctx, day, ins.order);
  const it = sim?.items[0];
  if (!base || !sim || !it) return null;
  return {
    date: day.date,
    start: it.start,
    end: it.end,
    addKm: sim.km - base.km,
  };
}

const later = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/**
 * Best free slots for a new appointment, one per day from `today` on,
 * without touching anything validated and within the day's visit caps.
 */
export function insertOptions(
  ctx: PlannerContext,
  ap: Appointment,
  today: IsoDate,
): InsertOption[] {
  const task = apptTask(ctx, ap);
  if (!task) return [];
  const from = later(task.earliest, today);
  if (from > task.latest) return [];
  const noRelax = stateRuleOptions(ctx);
  return frozenDays(ctx, ap, from, task.latest, new Set())
    .filter(
      (day) =>
        allowedDay(ctx, task, day, noRelax, false) &&
        hasRoom(day, task, false, 0),
    )
    .map((day) => optionOn(ctx, day, task))
    .filter((o): o is InsertOption => o !== null)
    .sort((a, b) => a.addKm - b.addKm || (a.date < b.date ? -1 : 1))
    .slice(0, MAX_OPTIONS);
}

/**
 * The appointment's dates touch the validated plan. Only then is it an
 * « urgent » insertion (free slots first, moves only if allowed); before
 * validation it is simply added and placed by its priority.
 */
export function touchesValidatedPlan(
  state: PlannerState,
  ap: Appointment,
): boolean {
  const [from, to] =
    ap.when.kind === "FIXED"
      ? [ap.when.date, ap.when.date]
      : [ap.when.from, ap.when.to];
  return state.validated.some((v) => v.date >= from && v.date <= to);
}

/** Validated items whose time overlaps a fixed-time appointment. */
export function fixedConflicts(
  ctx: PlannerContext,
  ap: Appointment,
): ValidatedItem[] {
  if (ap.when.kind !== "FIXED") return [];
  const { date, time } = ap.when;
  return ctx.state.validated.filter(
    (v) => v.date === date && v.start < time + ap.dur && v.end > time,
  );
}

function positions(
  ctx: PlannerContext,
  days: readonly Day[],
  routes: ReadonlyMap<IsoDate, readonly Task[]>,
): Map<string, Slot> {
  const where = new Map<string, Slot>();
  for (const day of days) {
    const sim = simulate(ctx, day, routes.get(day.date) ?? []);
    for (const it of sim?.items ?? [])
      where.set(it.task.id, { date: day.date, start: it.start, end: it.end });
  }
  return where;
}

/**
 * Re-place only the new appointment and the validated items the user allowed
 * to move (never fixed ones). Everything else stays. Returns the exact changes.
 */
export function insertWithMoves(
  ctx: PlannerContext,
  ap: Appointment,
  movableIds: readonly string[],
  today: IsoDate,
): InsertResult {
  const task = apptTask(ctx, ap);
  if (!task) return NOTHING;
  // Only future items move, and never into the past.
  const moving = ctx.state.validated.filter(
    (v) => movableIds.includes(v.id) && !v.fixed && v.date >= today,
  );
  const tasks = [
    { ...task, priority: "MUST" as const },
    ...moving.map((v) => itemToTask(ctx, v)),
  ].map((t) => ({
    ...t,
    earliest: later(t.earliest, today),
  }));
  const P0 = minDate(tasks.map((t) => t.earliest)) ?? today;
  const P1 = maxDate(tasks.map((t) => t.latest)) ?? today;
  if (P0 > P1) return NOTHING;
  const days = frozenDays(ctx, ap, P0, P1, new Set(moving.map((v) => v.id)));
  const opts = stateRuleOptions(ctx);
  const placed = placeTasks(ctx, days, tasks, opts, P1);
  const where = positions(ctx, days, placed.routes);
  const placement = where.get(task.id) ?? null;
  if (!placement) return NOTHING;
  const changes = moving
    .map((item) => ({ item, to: where.get(item.id) ?? null }))
    .filter(
      (c) => !c.to || c.to.date !== c.item.date || c.to.start !== c.item.start,
    );
  return { placement, changes, bent: placed.bent };
}

/**
 * The validated list after the user confirmed an insertion: the new
 * appointment is added, moved items are flagged « décalé », the others are
 * the very same objects. Null when the insertion found no slot.
 */
export function applyInsertion(
  ctx: PlannerContext,
  ap: Appointment,
  result: InsertResult,
): ValidatedItem[] | null {
  const task = apptTask(ctx, ap);
  const slot = result.placement;
  if (!task || !slot) return null;
  const changed = new Map(result.changes.map((c) => [c.item.id, c.to]));
  const kept = ctx.state.validated
    .filter((v) => v.id !== ap.id)
    .flatMap((v): ValidatedItem[] => {
      if (!changed.has(v.id)) return [v];
      const to = changed.get(v.id);
      return to
        ? [{ ...v, date: to.date, start: to.start, end: to.end, moved: true }]
        : [];
    });
  const added: ValidatedItem = {
    id: ap.id,
    apptId: ap.id,
    kind: "APPT",
    title: ap.title,
    participants: ap.participants,
    personId: null,
    place: task.place,
    dur: ap.dur,
    date: slot.date,
    start: slot.start,
    end: slot.end,
    priority: ap.priority,
    earliest: task.earliest,
    latest: task.latest,
    fixed: ap.when.kind === "FIXED",
    movable: false,
    moved: false,
  };
  return [...kept, added];
}
