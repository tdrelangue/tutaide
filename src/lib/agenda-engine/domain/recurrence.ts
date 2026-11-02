import type { PlannerContext } from "./context";
import type { Contact, IsoDate, Period, VisitPlan } from "./model";
import { addDays } from "./time";

const PERIOD_DAYS: Readonly<Record<Period, number>> = {
  WEEK: 7,
  MONTH: 30.4,
  QUARTER: 91.3,
  YEAR: 365,
};

const everyOf = (visits: VisitPlan) => visits.every ?? 1;

/** Whole numbers of visits and periods, at most one visit a day. Anything else cannot be planned. */
export function isValidVisitPlan(visits: VisitPlan): boolean {
  const every = everyOf(visits);
  return (
    Number.isInteger(visits.count) &&
    visits.count >= 1 &&
    Number.isInteger(every) &&
    every >= 1 &&
    intervalDays(visits) >= 1
  );
}

/** Days between two regular visits. */
export function intervalDays(visits: VisitPlan): number {
  return (PERIOD_DAYS[visits.period] * everyOf(visits)) / visits.count;
}

export interface LastSeen {
  readonly date: IsoDate | null;
  /** Title of the appointment that set the date; null = last visit on file. */
  readonly source: string | null;
}

type Sighting = { readonly date: IsoDate; readonly source: string };

/**
 * Only the validated plan is the planning: proposals, blocks placed by hand
 * and appointments not yet placed never count (Thomas, 2026-10-15).
 */
function validatedWith(ctx: PlannerContext, personId: string): Sighting[] {
  return ctx.state.validated
    .filter((v) => v.participants.includes(personId))
    .map((v) => ({ date: v.date, source: v.title }));
}

function latest(start: LastSeen, sightings: readonly Sighting[]): LastSeen {
  let best = start;
  for (const s of sightings)
    if (best.date === null || s.date > best.date) best = s;
  return best;
}

/**
 * « Vu le »: the last visit on file, a held item in history, or a validated
 * item whose date has passed (it counts as held until marked « N'a pas eu lieu »).
 */
export function lastSeen(ctx: PlannerContext, person: Contact): LastSeen {
  const { past, today } = ctx.state;
  const held = past
    .filter((p) => p.held && p.participants.includes(person.id))
    .map((p) => ({ date: p.date, source: p.title }));
  const done = validatedWith(ctx, person.id).filter((v) => v.date <= today);
  // A made-up start date (last visit unknown) is never a visit.
  const onFile = person.visits?.startedOn === undefined ? (person.visits?.lastVisit ?? null) : null;
  return latest({ date: onFile, source: null }, [
    ...held,
    ...done,
  ]);
}

/** Appointments with the person, validated or not: each one stands for a visit (Thomas, 2026-10-15). */
function appointmentsWith(ctx: PlannerContext, personId: string): Sighting[] {
  return ctx.state.appointments
    .filter((a) => a.participants.includes(personId))
    .map((a) => ({
      date: a.when.kind === "FIXED" ? a.when.date : a.when.from,
      source: a.title,
    }));
}

/**
 * Where the visit rhythm starts from: « vu », a validated item still to come
 * (« prévu »), or any appointment with the person, which stands for the visit:
 * a quarterly person met at 2 months restarts the 3 months from that meeting.
 */
export function rhythmAnchor(ctx: PlannerContext, person: Contact): LastSeen {
  const anchor = latest(lastSeen(ctx, person), [
    ...validatedWith(ctx, person.id),
    ...appointmentsWith(ctx, person.id),
  ]);
  // Never seen, last visit unknown: the rhythm starts the day the person was added.
  const startedOn = person.visits?.startedOn;
  return anchor.date === null && startedOn !== undefined ? { date: startedOn, source: null } : anchor;
}

/** Next regular visit = last « vu », « prévu » or appointment with the person + frequency. */
export function nextVisitDue(
  ctx: PlannerContext,
  person: Contact,
): IsoDate | null {
  const { date } = rhythmAnchor(ctx, person);
  if (!person.visits || date === null || !isValidVisitPlan(person.visits))
    return null;
  return addDays(date, intervalDays(person.visits));
}
