import { buildDays, createContext, eachDay, stateRuleOptions } from "../../agenda-engine/domain";
import type { Block, Day, IsoDate, PlannedDay, PlannedItem, PlannerState, Settings, SlotRule } from "../../agenda-engine/domain";
import type { BridgeIssue } from "../bridge/issues";
import type { ProposedPeriod } from "../bridge/ops/week";
import { toIssueViews } from "./issue-messages";
import { dayLabel, nameIndex, roundKm } from "./labels";
import { buildProposalMeta } from "./proposal-meta";
import { blockEntry, fixedAppointmentEntry, pastEntry, proposedEntry, validatedEntry } from "./week-entries";
import type { EntryContext } from "./week-entries";
import type { DayView, EntryView, WeekView } from "./types";

/** Visible hours by default: 07:30 to 20:30. */
const GRID_FROM = 450;
const GRID_TO = 1230;
/** The grid grows by half-hours. */
const GRID_STEP = 30;
const DAY_MINUTES = 1440;
const CLOSED_DEFAULT_LABEL = "Indisponible";

export type WeekInput = {
  readonly state: PlannerState;
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** Null: the stored planning only. */
  readonly proposal: ProposedPeriod | null;
  readonly issues: readonly BridgeIssue[];
};

/** What one day holds besides the stored items, from the proposal or, without one, from the rules alone. */
type DaySource = {
  readonly blocks: readonly Block[];
  readonly items: readonly PlannedItem[];
  readonly closed: SlotRule | null;
  readonly offDay: boolean;
  readonly km: number | null;
  readonly finishMin: number | null;
  readonly unreachable: boolean;
};

/** Lunch, unavailability, closures and off days of every day, without planning anything. */
function ruleDays(state: PlannerState, from: IsoDate, to: IsoDate): Map<IsoDate, Day> {
  const ctx = createContext(state);
  const held = state.validated.filter((v) => v.date >= from && v.date <= to);
  return new Map(buildDays(ctx, from, to, [], held, stateRuleOptions(ctx)).map((d) => [d.date, d]));
}

function plannedSource(day: PlannedDay): DaySource {
  const moves = day.km > 0;
  return {
    blocks: day.blocks,
    items: day.items,
    closed: day.closed,
    offDay: day.offDay,
    km: moves ? roundKm(day.km) : null,
    finishMin: moves ? day.finish : null,
    unreachable: day.unreachable,
  };
}

function ruleSource(day: Day | undefined): DaySource {
  // A day absent from buildDays is neither worked nor holding anything.
  return { blocks: day?.blocks ?? [], items: [], closed: day?.closed ?? null, offDay: day?.offDay ?? true, km: null, finishMin: null, unreachable: false };
}

/** Without a proposal, fixed-time appointments not validated yet (with one, the plan already places them). */
function pendingFixed(date: IsoDate, state: PlannerState, ctx: EntryContext, hasProposal: boolean): EntryView[] {
  if (hasProposal) return [];
  const stored = new Set([...state.validated, ...state.past].map((i) => i.apptId).filter((id): id is string => id !== null));
  return state.appointments
    .filter((a) => a.when.kind === "FIXED" && a.when.date === date && !stored.has(a.id))
    .map((a) => fixedAppointmentEntry(a, state, ctx))
    .filter((e): e is EntryView => e !== null);
}

function entriesOf(date: IsoDate, source: DaySource, state: PlannerState, ctx: EntryContext, hasProposal: boolean): EntryView[] {
  const entries = [
    ...pendingFixed(date, state, ctx, hasProposal),
    ...state.validated.filter((v) => v.date === date).map((v) => validatedEntry(v, ctx)),
    ...state.past.filter((p) => p.date === date).map((p) => pastEntry(p, ctx)),
    ...source.blocks.map((b) => blockEntry(date, b, ctx)).filter((e): e is EntryView => e !== null),
    ...source.items.map((i) => proposedEntry(date, i, ctx)),
  ];
  return entries.sort((a, b) => a.start - b.start || a.end - b.end);
}

function buildDay(date: IsoDate, source: DaySource, input: WeekInput, names: ReadonlyMap<string, string>): DayView {
  const { state, proposal } = input;
  const warnings = (proposal?.proposal.plan.pinWarnings ?? []).filter((w) => w.date === date);
  const entries = entriesOf(date, source, state, { today: state.today, names, warnings }, proposal !== null);
  return {
    date,
    label: dayLabel(date),
    isToday: date === state.today,
    isPast: date < state.today,
    offDay: source.offDay,
    closedLabel: source.closed ? source.closed.label || CLOSED_DEFAULT_LABEL : null,
    unreachable: source.unreachable,
    km: source.km,
    finishMin: source.finishMin,
    entries,
  };
}

function floorStep(minutes: number): number {
  return Math.floor(minutes / GRID_STEP) * GRID_STEP;
}

function ceilStep(minutes: number): number {
  return Math.ceil(minutes / GRID_STEP) * GRID_STEP;
}

/** 07:30–20:30, widened when an entry or the end-of-day lines fall outside. */
function gridFor(settings: Settings, days: readonly DayView[]): WeekView["grid"] {
  const entries = days.flatMap((d) => d.entries);
  const lastLine = Math.max(settings.dayEnd, settings.dayEndLimit ?? 0);
  const from = Math.max(0, Math.min(GRID_FROM, ...entries.map((e) => floorStep(e.start))));
  const to = Math.min(DAY_MINUTES, Math.max(GRID_TO, ceilStep(lastLine), ...entries.map((e) => ceilStep(e.end))));
  return { from, to, dayEnd: settings.dayEnd, dayEndLimit: settings.dayEndLimit };
}

/**
 * The week screen from the engine's results. Days are every date of the period
 * (a non-working day is still listed, flagged `offDay`). Entries: the stored
 * planning (VALIDATED / DONE / MISSED), then what the proposal adds (PROPOSED,
 * PINNED, FIXED) and the day's lunch and unavailability. Validated items also
 * appear as « held » blocks of the plan: those are left out, never doubled.
 */
export function buildWeekView(input: WeekInput): WeekView {
  const { state, from, to, proposal } = input;
  const rules = ruleDays(state, from, to);
  const planned = new Map((proposal?.proposal.plan.days ?? []).map((d) => [d.date, d]));
  const names = nameIndex(state);
  const days = eachDay(from, to).map((date) => {
    const day = planned.get(date);
    return buildDay(date, day ? plannedSource(day) : ruleSource(rules.get(date)), input, names);
  });
  return {
    today: state.today,
    from,
    to,
    grid: gridFor(state.settings, days),
    days,
    proposal: proposal ? buildProposalMeta(state, proposal) : null,
    issues: toIssueViews(input.issues),
  };
}
