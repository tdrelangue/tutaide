import type { PlannerContext } from "./context";
import type {
  Appointment,
  Contact,
  IsoDate,
  Place,
  Priority,
  ValidatedItem,
  VisitPlan,
} from "./model";
import type { Task, Unplaced } from "./planTypes";
import { PRIO_RANK } from "./priority";
import {
  intervalDays,
  isValidVisitPlan,
  lastSeen,
  nextVisitDue,
  rhythmAnchor,
} from "./recurrence";
import { cityKey } from "./grouping";
import { addDays } from "./time";

/** Max visit occurrences generated per person and period. */
const MAX_OCCURRENCES = 12;

export interface TaskSet {
  /** Visits not due in the period, offered only on a day that already goes to their town. */
  readonly early?: readonly Task[];
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
  const stored = ctx.places.get(ap.placeId);
  if (!stored) return null;
  const place = atTemporary(ctx, ap, stored);
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

/**
 * « Chez la personne » while she is somewhere else (hospital, EHPAD…; Thomas,
 * 2026-11-03): the appointment goes to her temporary address when it covers
 * the appointment's day (its fixed date, or the start of its window).
 */
function atTemporary(ctx: PlannerContext, ap: Appointment, stored: Place): Place {
  const day = ap.when.kind === "FIXED" ? ap.when.date : ap.when.from;
  for (const id of ap.participants) {
    const c = ctx.contacts.get(id);
    if (c?.places[0]?.id === ap.placeId && c.temporary) return placeOn(c, stored, day);
  }
  return stored;
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

/** The temporary address while it lasts (the visit's due day decides), the home otherwise. */
export function placeOn(person: Contact, home: Place, day: IsoDate): Place {
  const temp = person.temporary;
  return temp && day >= temp.from && day <= temp.to ? temp.place : home;
}

function visitTask(
  ctx: PlannerContext,
  person: Contact,
  home: Place,
  o: Occurrence,
  rescheduled: boolean,
): Task {
  const place = placeOn(person, home, o.due);
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
    dur: ctx.state.durationOverrides?.[id] ?? person.visits?.minutes ?? ctx.state.settings.visitMinutes,
    priority: rescheduled ? atLeastNormal(base) : base,
    strict: false,
    rescheduled,
  };
}

/** People of one town given the same week, at most this many (a big town spreads over several weeks). */
const FRESH_PER_WEEK_AND_TOWN = 8;

/** Never seen and last visit unknown: the people the first round must spread out. */
function isFresh(ctx: PlannerContext, person: Contact): boolean {
  return (
    person.visits?.startedOn !== undefined &&
    lastSeen(ctx, person).date === null &&
    rhythmAnchor(ctx, person).source === null
  );
}

/** Stable small number from a text (same town, same week, every time it is computed). */
function textHash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1_000_003;
  return h;
}

/**
 * Week rank of each person's first visit (Thomas, 2026-11-03): a caseload
 * entered at once is spread over the interval from the start, so the next
 * round is regular too — and a town's people share their week (« quitte à
 * être à Tulle »), by packs of FRESH_PER_WEEK_AND_TOWN. Pure and stable.
 */
export function freshWeeks(ctx: PlannerContext): ReadonlyMap<string, number> {
  const byTown = new Map<string, Contact[]>();
  for (const person of ctx.state.contacts) {
    if (!isFresh(ctx, person)) continue;
    const town = cityKey(person.places[0]?.address ?? "") ?? "?";
    byTown.set(town, [...(byTown.get(town) ?? []), person]);
  }
  const out = new Map<string, number>();
  for (const [town, people] of byTown) {
    const sorted = [...people].sort((a, b) => (a.id < b.id ? -1 : 1));
    sorted.forEach((p, i) => out.set(p.id, textHash(town) + Math.floor(i / FRESH_PER_WEEK_AND_TOWN)));
  }
  return out;
}

/**
 * Person whose last visit is unknown and not seen since: the first visit
 * goes in the week given by `freshWeeks`, inside the first interval from
 * `startedOn`, at low priority (postponed quietly when that week is full,
 * then offered the week after). Null once that interval is over or a later
 * visit is known: the usual rhythm applies.
 */
function freshStart(
  ctx: PlannerContext,
  person: Contact,
  visits: VisitPlan,
  P0: IsoDate,
  P1: IsoDate,
  rank: number | undefined,
): { first: Occurrence; nextDue: IsoDate } | null {
  const { startedOn } = visits;
  if (startedOn === undefined || !isFresh(ctx, person)) return null;
  const interval = intervalDays(visits);
  const end = addDays(startedOn, interval);
  if (end < P0 || startedOn > P1) return null;
  const weeks = Math.max(1, Math.floor(interval / 7));
  const weekStart = addDays(startedOn, ((rank ?? 0) % weeks) * 7);
  const weekEnd = addDays(weekStart, 6) > end ? end : addDays(weekStart, 6);
  // Its week went by without room: from now on, within the interval.
  const missed = weekEnd < P0;
  const earliest = missed ? P0 : weekStart < P0 ? P0 : weekStart;
  const latest = missed ? (addDays(P0, 6) > end ? end : addDays(P0, 6)) : weekEnd;
  const due = addDays(earliest, 2) > latest ? latest : addDays(earliest, 2);
  return {
    first: { earliest, latest, due, overdue: false },
    nextDue: addDays(due, interval),
  };
}

/** Regular visits of one protected person in the period. */
function visitTasks(
  ctx: PlannerContext,
  person: Contact,
  P0: IsoDate,
  P1: IsoDate,
  freshRanks: ReadonlyMap<string, number>,
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
  // Only a temporary address (just entered from hospital): it is enough while it lasts.
  const place = person.places[0] ?? person.temporary?.place;
  if (!place) return invalid("NO_ADDRESS");
  const fresh = freshStart(ctx, person, visits, P0, P1, freshRanks.get(person.id));
  const due = fresh?.nextDue ?? nextVisitDue(ctx, person);
  if (due === null) return [];
  const missed = missedSinceLastSeen(ctx, person);
  const regular = occurrences(due, intervalDays(visits), P0, P1);
  return (fresh ? [fresh.first, ...regular] : regular)
    .filter((o) => !ctx.state.skips.includes(`${person.id}@${o.due}`))
    .map((o, i) => {
      const task = visitTask(ctx, person, place, o, missed && i === 0);
      return fresh && i === 0 ? { ...task, priority: "LOW" as const } : task;
    });
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

/**
 * The next visit of a person, as a task of the period (keyed on the period:
 * « Pas cette fois » refuses this offer only, never the visit at its normal
 * time). Null when the person cannot be visited or was refused for the period.
 */
function periodVisit(ctx: PlannerContext, person: Contact, P0: IsoDate, P1: IsoDate): Task | null {
  const { visits } = person;
  const place = person.places[0] ?? person.temporary?.place;
  if (!visits || !place || person.category !== "PROTEGE" || person.status !== "ACTIVE" || !isValidVisitPlan(visits)) return null;
  const id = `${person.id}@${P0}`;
  if (ctx.state.skips.includes(id)) return null;
  const due = nextVisitDue(ctx, person) ?? P0;
  return { ...visitTask(ctx, person, place, { earliest: P0, latest: P1, due, overdue: false }, false), id };
}

/**
 * The next visit of each active person with nothing in the period: a
 * candidate to be seen in advance when a day already goes to their area.
 */
function earlyTasks(ctx: PlannerContext, P0: IsoDate, P1: IsoDate, busy: ReadonlySet<string>): Task[] {
  return ctx.state.contacts.flatMap((person) => {
    if (busy.has(person.id)) return [];
    const task = periodVisit(ctx, person, P0, P1);
    if (!task || task.due <= P1) return [];
    return [{ ...task, priority: "LOW" as const, early: true }];
  });
}

/**
 * « Préparer ma proposition »: the picked persons are all placed in the
 * period (their due visit, or their next one, at least « Normale »), the
 * picked appointments too; every other visit of the period, and the next
 * visit of the others, is only offered on a day that goes to its area.
 */
function applyChoice(ctx: PlannerContext, set: TaskSet & { early: readonly Task[] }, P0: IsoDate, P1: IsoDate): TaskSet {
  const choice = ctx.state.choice;
  if (!choice) return set;
  const persons = new Set(choice.persons);
  const appointments = new Set(choice.appointments);
  const inPeriod = (t: Task) => t.earliest <= P1 && t.latest >= P0;
  const isVisit = (t: Task) => t.kind === "VISIT" && t.person !== null && t.originalDate === null;
  const picked = (t: Task) => (isVisit(t) ? persons.has(t.person?.id ?? "") : t.apptId === null || appointments.has(t.apptId));
  const visits = set.tasks.filter((t) => isVisit(t) && inPeriod(t));
  const covered = new Set(visits.filter(picked).map((t) => t.person?.id));
  const extra = ctx.state.contacts.flatMap((p) => {
    if (!persons.has(p.id) || covered.has(p.id)) return [];
    const task = periodVisit(ctx, p, P0, P1);
    return task ? [task] : [];
  });
  const chosen = [...set.tasks.filter((t) => picked(t) && (!isVisit(t) || inPeriod(t))), ...extra].map((t) =>
    isVisit(t) ? { ...t, earliest: P0, latest: P1, strict: false, priority: atLeastNormal(t.priority) } : t,
  );
  const offered = visits.filter((t) => !picked(t)).map((t) => ({ ...t, priority: "LOW" as const, early: true }));
  const early = set.early.filter((t) => !persons.has(t.person?.id ?? ""));
  return { ...set, tasks: chosen, early: [...offered, ...early] };
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
  const freshRanks = freshWeeks(ctx);
  for (const person of ctx.state.contacts) {
    const out = visitTasks(ctx, person, P0, P1, freshRanks);
    if (Array.isArray(out)) visits.push(...out);
    else invalid.push(out);
  }
  const pinnedIds = new Set(ctx.state.pins.map((p) => p.id));
  const tasks = [
    ...appts.tasks,
    ...visits,
    ...moving.map((v) => itemToTask(ctx, v)),
  ].filter((t) => !pinnedIds.has(t.id));
  // Anyone already in the period (a visit, an appointment, a validated item) is not offered early.
  const busy = new Set([
    // A visit whose window is outside the period (a first visit due another week) leaves the person free.
    ...tasks.filter((t) => t.earliest <= P1 && t.latest >= P0).flatMap((t) => t.participants),
    ...held.flatMap((v) => v.participants),
    ...appts.fixed.flatMap((t) => t.participants),
    ...ctx.state.pins.flatMap((p) => p.participants),
  ]);
  return applyChoice(ctx, { fixed: fixedEvents(ctx, P0, P1, appts), tasks, held, invalid, early: earlyTasks(ctx, P0, P1, busy) }, P0, P1);
}
