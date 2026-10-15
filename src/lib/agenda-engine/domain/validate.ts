import type { PlannerState, ValidatedItem } from "./model";
import type { Plan, Task } from "./planTypes";

function toItem(
  task: Task,
  date: string,
  start: number,
  end: number,
  fixed: boolean,
): ValidatedItem {
  return {
    id: task.id,
    apptId: task.apptId,
    kind: task.kind,
    title: task.title,
    participants: task.participants,
    personId: task.person?.id ?? null,
    place: task.place,
    dur: task.dur,
    date,
    start,
    end,
    priority: task.priority,
    earliest: task.earliest,
    latest: task.latest,
    fixed,
    movable: false,
    moved: false,
  };
}

/** Freezes a proposed plan: its items and fixed appointments become validated items. */
export function toValidatedItems(plan: Plan): ValidatedItem[] {
  const out: ValidatedItem[] = [];
  for (const day of plan.days) {
    // A block placed by hand stays movable later; a fixed-time appointment never moves.
    for (const b of day.blocks)
      if (b.kind === "event" && b.task)
        out.push(toItem(b.task, day.date, b.s, b.e, !b.task.pinned));
    for (const it of day.items)
      out.push(toItem(it.task, day.date, it.start, it.end, false));
  }
  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start,
  );
}

/** The state once the user validated this plan: its items join the validated plan, hand-placed blocks included. */
export function validatePlan(state: PlannerState, plan: Plan): PlannerState {
  const items = toValidatedItems(plan);
  const ids = new Set(items.map((v) => v.id));
  return {
    ...state,
    validated: [...state.validated, ...items],
    pins: state.pins.filter((p) => !ids.has(p.id)),
  };
}
