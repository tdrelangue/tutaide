import { availWindows } from "./availability";
import type { PlannerContext } from "./context";
import type { Minutes, Place } from "./model";
import type { Block, Day, PlannedItem, Simulation, Task } from "./planTypes";

/** Mutable cursor of one simulated tour (local to `simulate`). */
interface Tour {
  t: Minutes;
  pos: Place;
  km: number;
  /** End of the last thing done at a place: we may drive during a place-less block (lunch). */
  lastActEnd: Minutes;
  late: boolean;
  /** The day ends with a block the user set (fixed appointment, office…), not with a planned item. */
  lastWasBlock: boolean;
  readonly used: Set<Block>;
  readonly items: PlannedItem[];
}

const MUST_ARRIVE_ON_TIME = new Set(["held", "event", "busy"]);

function moveTo(ctx: PlannerContext, tour: Tour, place: Place): void {
  if (place.remote === true) return;
  tour.km += ctx.travel.km(tour.pos, place);
  tour.pos = place;
}

/** Go through a block; going to a fixed appointment (or the office) means being there on time. */
function jump(ctx: PlannerContext, tour: Tour, b: Block): void {
  if (b.place && b.place.remote !== true) {
    if (
      MUST_ARRIVE_ON_TIME.has(b.kind) &&
      tour.lastActEnd + ctx.travel.minutes(tour.pos, b.place) > b.s
    )
      tour.late = true;
    moveTo(ctx, tour, b.place);
    tour.lastActEnd = b.e;
  }
  if (b.e >= tour.t) tour.lastWasBlock = true;
  tour.t = Math.max(tour.t, b.e);
  tour.used.add(b);
}

/** Place one task at the earliest moment it fits; false when it cannot. */
function placeNext(
  ctx: PlannerContext,
  day: Day,
  tour: Tour,
  task: Task,
): boolean {
  const wins = availWindows(ctx, task, day.date);
  for (let guard = 0; guard <= day.blocks.length; guard++) {
    const arrive = tour.t + ctx.travel.minutes(tour.pos, task.place);
    const w = wins.find(([a, b]) => Math.max(arrive, a) + task.dur <= b);
    if (!w) return false;
    const start = Math.max(arrive, w[0]);
    const end = start + task.dur;
    const clash = day.blocks.find(
      (b) => !tour.used.has(b) && b.s < end && b.e > tour.t,
    );
    if (clash) {
      jump(ctx, tour, clash);
      continue;
    }
    moveTo(ctx, tour, task.place);
    tour.items.push({ task, start, end });
    tour.t = end;
    tour.lastActEnd = end;
    tour.lastWasBlock = false;
    return true;
  }
  return false;
}

/**
 * Timed tour of a day, from home and back, doing the tasks in this order
 * around the day's blocks. Null when the order does not fit, or makes the
 * user late for a fixed or validated appointment.
 */
export function simulate(
  ctx: PlannerContext,
  day: Day,
  order: readonly Task[],
): Simulation | null {
  const home = ctx.state.settings.home;
  const tour: Tour = {
    t: day.start,
    pos: home,
    km: 0,
    lastActEnd: day.start,
    late: false,
    lastWasBlock: false,
    used: new Set(),
    items: [],
  };
  for (const task of order) if (!placeNext(ctx, day, tour, task)) return null;
  for (const b of day.blocks)
    if (!tour.used.has(b) && b.e > tour.t && b.place) jump(ctx, tour, b);
  if (tour.late) return null;
  const finish = tour.t + ctx.travel.minutes(tour.pos, home);
  // Home by the strict limit, unless the day ends with something the user set himself.
  const { dayEnd, dayEndLimit } = ctx.state.settings;
  if (
    tour.items.length > 0 &&
    !tour.lastWasBlock &&
    finish > (dayEndLimit ?? dayEnd)
  )
    return null;
  return {
    items: tour.items,
    km: tour.km + ctx.travel.km(tour.pos, home),
    finish,
  };
}
