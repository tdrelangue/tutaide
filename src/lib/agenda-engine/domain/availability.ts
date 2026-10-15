import type { PlannerContext } from "./context";
import type { IsoDate, Minutes } from "./model";
import type { Task } from "./planTypes";
import { isoDow } from "./time";

export type TimeWindow = readonly [Minutes, Minutes];

/** Pairwise intersection of two window lists, sorted by start. */
export function intersect(
  a: readonly TimeWindow[],
  b: readonly TimeWindow[],
): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const [a1, a2] of a) {
    for (const [b1, b2] of b) {
      const s = Math.max(a1, b1);
      const e = Math.min(a2, b2);
      if (e > s) out.push([s, e]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/**
 * Results per context and task: the planner asks the same question thousands
 * of times while trying orders. Contexts and tasks are immutable, so the
 * cache never changes an answer; WeakMaps let it go with them.
 */
const memo = new WeakMap<
  PlannerContext,
  WeakMap<Task, Map<IsoDate, readonly TimeWindow[]>>
>();

/**
 * Time windows, long enough for the task, in which every participant can
 * attend on that date. Contacts that no longer exist are ignored.
 */
export function availWindows(
  ctx: PlannerContext,
  task: Task,
  date: IsoDate,
): readonly TimeWindow[] {
  let byTask = memo.get(ctx);
  if (!byTask) memo.set(ctx, (byTask = new WeakMap()));
  let byDate = byTask.get(task);
  if (!byDate)
    byTask.set(task, (byDate = new Map<IsoDate, readonly TimeWindow[]>()));
  const known = byDate.get(date);
  if (known) return known;
  const wins = computeWindows(ctx, task, date);
  byDate.set(date, wins);
  return wins;
}

function computeWindows(
  ctx: PlannerContext,
  task: Task,
  date: IsoDate,
): TimeWindow[] {
  const { dayStart, dayEnd, dayEndLimit } = ctx.state.settings;
  const dow = isoDow(date);
  // Nothing is planned past the strict limit; the wished end is a cost (placement).
  let wins: TimeWindow[] = [[dayStart, dayEndLimit ?? dayEnd]];
  if (task.fixedStart !== null)
    wins = intersect(wins, [[task.fixedStart, task.fixedStart + task.dur]]);
  for (const id of task.participants) {
    const c = ctx.contacts.get(id);
    if (!c) continue;
    if (c.avail)
      wins = intersect(
        wins,
        c.avail
          .filter((a) => a.dows.includes(dow))
          .map((a): TimeWindow => [a.from, a.to]),
      );
    if (c.notBefore !== null) wins = intersect(wins, [[c.notBefore, 24 * 60]]);
  }
  return wins.filter(([a, b]) => b - a >= task.dur);
}
