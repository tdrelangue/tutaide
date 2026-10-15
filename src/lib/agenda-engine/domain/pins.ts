// Blocks the user dragged before validation: kept where he put them, checked, never refused.
import { availWindows } from "./availability";
import type { PlannerContext } from "./context";
import type { IsoDate, Minutes, PinnedItem, PlannerState } from "./model";
import type {
  Block,
  Day,
  PinWarning,
  PinWarningReason,
  PlannedDay,
  Task,
} from "./planTypes";

export interface PinSlot {
  readonly date: IsoDate;
  readonly start: Minutes;
}

/** What gets pinned: a proposed task, or an already pinned block moved again. */
type Pinnable = Task | PinnedItem;

function personIdOf(item: Pinnable): string | null {
  return "person" in item ? (item.person?.id ?? null) : item.personId;
}

/** The state with this block placed by hand at `slot` (replacing any earlier position). */
export function pinTask(
  state: PlannerState,
  item: Pinnable,
  slot: PinSlot,
): PlannerState {
  const pin: PinnedItem = {
    id: item.id,
    kind: item.kind,
    apptId: item.apptId,
    personId: personIdOf(item),
    title: item.title,
    participants: item.participants,
    place: item.place,
    dur: item.dur,
    priority: item.priority,
    date: slot.date,
    start: slot.start,
  };
  return {
    ...state,
    pins: [...state.pins.filter((p) => p.id !== item.id), pin],
  };
}

/** Gives the block back to the planner. */
export function unpin(state: PlannerState, id: string): PlannerState {
  return { ...state, pins: state.pins.filter((p) => p.id !== id) };
}

function pinReason(
  ctx: PlannerContext,
  day: Day,
  b: Block,
  unreachable: boolean,
): PinWarningReason | null {
  if (day.closed || day.offDay) return "CLOSED_DAY";
  const overlapping = day.blocks.filter(
    (o) => o !== b && o.s < b.e && b.s < o.e,
  );
  if (overlapping.some((o) => o.kind !== "lunch")) return "OVERLAP";
  if (overlapping.length > 0) return "LUNCH";
  const { dayEnd, dayEndLimit } = ctx.state.settings;
  if (b.e > (dayEndLimit ?? dayEnd)) return "PAST_LIMIT";
  if (b.task && availWindows(ctx, b.task, day.date).length === 0)
    return "UNAVAILABLE";
  return unreachable ? "LATE" : null;
}

/** One warning per pinned block whose position breaks something (the first problem found). */
export function pinWarnings(
  ctx: PlannerContext,
  days: readonly Day[],
  planned: readonly PlannedDay[],
): PinWarning[] {
  const out: PinWarning[] = [];
  days.forEach((day, i) => {
    for (const b of day.blocks) {
      if (b.task?.pinned !== true) continue;
      const reason = pinReason(ctx, day, b, planned[i]?.unreachable === true);
      if (reason)
        out.push({
          taskId: b.task.id,
          title: b.task.title,
          date: day.date,
          reason,
        });
    }
  });
  return out;
}
