import type { PlannerContext } from "./context";
import type {
  Appointment,
  Contact,
  IsoDate,
  Place,
  Priority,
  ValidatedItem,
} from "./model";
import type { Task, Unplaced } from "./planTypes";
import { PRIO_RANK } from "./priority";
import {
  intervalDays,
  isValidVisitPlan,
  nextVisitDue,
  rhythmAnchor,
} from "./recurrence";
import { addDays } from "./time";

/** Max visit occurrences generated per person and period. */
const MAX_OCCURRENCES = 12;

export interface TaskSet {
  /** Fixed-time appointments of the period (not yet validated). */
  readonly fixed: readonly Task[];
  /** Everything the planner must place. */
  readonly tasks: readonly Task[];
  /** Validated items that stay where they are. */
  readonly held: readonly ValidatedItem[];
  /** Items that cannot be planned at all (unknown place, no address). */
  readonly invalid: readonly Unplaced[];
}

const NO_MOVE = {
  fixedStart: null,
  originalDate: null,
  originalStart: null,
  rescheduled: false,
  pinned: false,
} as const;

/** An appointment as a task: its own window, or its fixed time. Null when its place is unknown. */
export function apptTask(ctx: PlannerContext, ap: Appointment): Task | null {
  const place = ctx.places.get(ap.placeId);
  if (!place) return null;
  const base = {
    ...NO_MOVE,
    id: ap.id,
    kind: "APPT" as const,
    title: ap.title,
    apptId: ap.id,
    participants: ap.participants,
    person: null,
    place,
    dur: ap.dur,
    priority: ap.priority,
    overdue: false,
    strict: true,
  };
  if (ap.when.kind === "FIXED") {
    const { date, time } = ap.when;
    return {
      ...base,
      earliest: date,
      latest: date,
      due: date,
      fixedStart: time,
    };
  }
  return {
    ...base,
    earliest: ap.when.from,
    latest: ap.when.to,
    due: ap.when.from,
  };
}

/** A validated item the user allowed to move, as a task kept inside its own window. */
export function itemToTask(ctx: PlannerContext, v: ValidatedItem): Task {
  return {
    ...NO_MOVE,
    id: v.id,
    kind: v.kind,
    title: v.title,
    apptId: v.apptId,
    participants: v.participants,
    person: v.personId === null ? null : (ctx.contacts.get(v.personId) ?? null),
    place: v.place,
    dur: v.dur,
    priority: v.priority,
    earliest: v.earliest,
    latest: v.latest,
    due: v.date,
    overdue: false,
    strict: true,
    originalDate: v.date,
    originalStart: v.start,
  };
}

/** The last visit was marked « N'a pas eu lieu » after the last real one. */
function missedSinceLastSeen(ctx: PlannerContext, person: Contact): boolean {
  // Already replaced by a validated visit to come: nothing to reschedule.
  const seen = rhythmAnchor(ctx, person).date;
  return ctx.state.past.some(
    (p) =>
      !p.held &&
      p.participants.includes(person.id) &&
      (seen === null || p.date > seen),
  );
}

function atLeastNormal(p: Priority): Priority {
  return PRIO_RANK[p] < PRIO_RANK.NORMAL ? "NORMAL" : p;
}

interface Occurrence {
  readonly earliest: IsoDate;
  readonly latest: IsoDate;
  readonly due: IsoDate;
  readonly overdue: boolean;
}

/** Due dates of the regular visits falling in the period. */
function occurrences(
  firstDue: IsoDate,
  interval: number,
  P0: IsoDate,
  P1: IsoDate,
): Occurrence[] {
  const out: Occurrence[] = [];
  let due = firstDue;
  if (addDays(due, 0.2 * interval) < P0) {
    out.push({ earliest: P0, latest: addDays(P0, 3), due, overdue: true });
    due = addDays(P0, interval);
  }
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    const earliest = addDays(due, -0.3 * interval);
    const latest = addDays(due, Math.max(1, 0.2 * interval));
    if (earliest > P1) break;
    if (due <= addDays(P1, 3) || latest <= addDays(P1, 7)) {
      out.push({
        earliest: earliest < P0 ? P0 : earliest,
        latest,
        due,
        overdue: false,
      });
    }
    due = addDays(due, interval);
  }
  return out;
}

function visitTask(
  ctx: PlannerContext,
  person: Contact,
  place: Place,
  o: Occurrence,
  rescheduled: boolean,
): Task {
  const id = `${person.id}@${o.due}`;
  const base =
    ctx.state.priorityOverrides[id] ?? person.visits?.priority ?? "LOW";
  return {
    ...NO_MOVE,
    ...o,
    id,
    kind: "VISIT",
    title: `Visite à ${person.name}`,
    apptId: null,
    participants: [person.id],
    person,
    place,
    dur: person.visits?.minutes ?? ctx.state.settings.visitMinutes,
    priority: rescheduled ? atLeastNormal(base) : base,
    strict: false,
    rescheduled,
  };
}

/** Regular visits of one protected person in the period. */
function visitTasks(
  ctx: PlannerContext,
  person: Contact,
  P0: IsoDate,
  P1: IsoDate,
): Task[] | Unplaced {
  const { visits } = person;
  if (!visits || person.category !== "PROTEGE" || person.status !== "ACTIVE")
    return [];
  const invalid = (reason: "NO_ADDRESS" | "INVALID_FREQUENCY"): Unplaced => ({
    task: null,
    apptId: null,
    personId: person.id,
    priority: visits.priority,
    reason,
  });
  if (!isValidVisitPlan(visits)) return invalid("INVALID_FREQUENCY");
  const place = person.places[0];
  if (!place) return invalid("NO_ADDRESS");
  const due = nextVisitDue(ctx, person);
  if (due === null) return [];
  const missed = missedSinceLastSeen(ctx, person);
  return occurrences(due, intervalDays(visits), P0, P1)
    .filter((o) => !ctx.state.skips.includes(`${person.id}@${o.due}`))
    .map((o, i) => visitTask(ctx, person, place, o, missed && i === 0));
}

/** Validated items of the period: held in place, unless movable (fixed items never move). */
export function heldItems(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  movable: ReadonlySet<string>,
) {
  const inPeriod = ctx.state.validated.filter(
    (v) => v.date >= P0 && v.date <= P1,
  );
  const moves = (v: ValidatedItem) => movable.has(v.id) && !v.fixed;
  return {
    held: inPeriod.filter((v) => !moves(v)),
    moving: inPeriod.filter(moves),
  };
}

interface ApptSplit {
  readonly fixed: Task[];
  readonly tasks: Task[];
  readonly invalid: Unplaced[];
}

/** Appointments not yet validated, sorted into fixed events, tasks to place and invalid ones. */
/** Blocks the user placed by hand in the period, as fixed events. */
export function pinnedTasks(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
): Task[] {
  return ctx.state.pins
    .filter((p) => p.date >= P0 && p.date <= P1)
    .map((p) => ({
      ...NO_MOVE,
      id: p.id,
      kind: p.kind,
      title: p.title,
      apptId: p.apptId,
      participants: p.participants,
      person:
        p.personId === null ? null : (ctx.contacts.get(p.personId) ?? null),
      place: p.place,
      dur: p.dur,
      priority: p.priority,
      earliest: p.date,
      latest: p.date,
      due: p.date,
      overdue: false,
      strict: true,
      fixedStart: p.start,
      pinned: true,
    }));
}

/** Everything with a set time in the period: fixed appointments and blocks placed by hand. */
export function fixedEvents(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  appts: ApptSplit,
): Task[] {
  return [...appts.fixed, ...pinnedTasks(ctx, P0, P1)];
}

export function appointmentTasks(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
): ApptSplit {
  // Validated or placed by hand: the planner does not place them again.
  const validatedIds = new Set([
    ...ctx.state.validated.map((v) => v.apptId ?? v.id),
    ...ctx.state.pins.map((p) => p.id),
  ]);
  const out: ApptSplit = { fixed: [], tasks: [], invalid: [] };
  for (const ap of ctx.state.appointments) {
    if (validatedIds.has(ap.id)) continue;
    const [from, to] =
      ap.when.kind === "FIXED"
        ? [ap.when.date, ap.when.date]
        : [ap.when.from, ap.when.to];
    if (to < P0 || from > P1) continue;
    const task = apptTask(ctx, ap);
    if (!task)
      out.invalid.push({
        task: null,
        apptId: ap.id,
        personId: null,
        priority: ap.priority,
        reason: "UNKNOWN_PLACE",
      });
    else if (task.fixedStart !== null) out.fixed.push(task);
    else
      out.tasks.push({
        ...task,
        earliest: task.earliest < P0 ? P0 : task.earliest,
      });
  }
  return out;
}

/** Everything the period must hold. */
export function buildTasks(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  movable: ReadonlySet<string>,
): TaskSet {
  const appts = appointmentTasks(ctx, P0, P1);
  const { held, moving } = heldItems(ctx, P0, P1, movable);
  const visits: Task[] = [];
  const invalid = [...appts.invalid];
  for (const person of ctx.state.contacts) {
    const out = visitTasks(ctx, person, P0, P1);
    if (Array.isArray(out)) visits.push(...out);
    else invalid.push(out);
  }
  const pinnedIds = new Set(ctx.state.pins.map((p) => p.id));
  const tasks = [
    ...appts.tasks,
    ...visits,
    ...moving.map((v) => itemToTask(ctx, v)),
  ].filter((t) => !pinnedIds.has(t.id));
  return { fixed: fixedEvents(ctx, P0, P1, appts), tasks, held, invalid };
}
