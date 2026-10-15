/**
 * Domain model of the agenda. Plain, serialisable data: everything the planner
 * needs is passed in, nothing is read from the outside world.
 */

/** Calendar date, "YYYY-MM-DD". */
export type IsoDate = string;
/** Minutes since midnight (local wall-clock time). */
export type Minutes = number;
/** ISO day of week: 1 = Monday … 7 = Sunday. */
export type IsoDow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Basse / Normale / Haute / Incontournable. */
export type Priority = "LOW" | "NORMAL" | "HIGH" | "MUST";
/** Impératif / Important (ask before breaking) / Souhaité / Si possible. */
export type Strength = "HARD" | "STRONG" | "MEDIUM" | "SOFT";
export type Period = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

export interface Place {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  /** A video call: no travel, the tour stays where it is. */
  readonly remote?: boolean;
}

/** A recurring availability window, e.g. "weekdays after 17:00". */
export interface Availability {
  readonly dows: readonly IsoDow[];
  readonly from: Minutes;
  readonly to: Minutes;
}

export type ContactCategory = "PROTEGE" | "FAMILLE" | "JUGE" | "PRO";
export type ContactStatus = "ACTIVE" | "PAUSED" | "ENDED";

/** Regular visits to a protected person. */
export interface VisitPlan {
  readonly count: number;
  readonly period: Period;
  /** Last visit on file before the agenda knew about this person. */
  readonly lastVisit: IsoDate;
  readonly priority: Priority;
  /** Visit length; null = the default from settings. */
  readonly minutes: number | null;
}

export interface PrefDayRule {
  readonly id: string;
  readonly type: "PREF_DAY";
  readonly dow: IsoDow;
  readonly strength: Strength;
  readonly label: string;
}

export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly category: ContactCategory;
  /** First place = default place (home for a protected person). */
  readonly places: readonly Place[];
  /** null = available whenever the user works. */
  readonly avail: readonly Availability[] | null;
  readonly notBefore: Minutes | null;
  readonly status: ContactStatus;
  readonly visits: VisitPlan | null;
  readonly prefDay: PrefDayRule | null;
}

interface RuleBase {
  readonly id: string;
  readonly label: string;
  readonly strength: Strength;
}
export interface UnavailableAllDayRule extends RuleBase {
  readonly type: "UNAVAILABLE";
  readonly dow: IsoDow;
  readonly allDay: true;
}
export interface UnavailableHoursRule extends RuleBase {
  readonly type: "UNAVAILABLE";
  readonly dow: IsoDow;
  readonly allDay: false;
  readonly from: Minutes;
  readonly to: Minutes;
  /** The user is at the office: getting there counts in the tour. */
  readonly atOffice: boolean;
}
export interface MaxVisitsRule extends RuleBase {
  readonly type: "MAX_VISITS";
  readonly dow: IsoDow;
  readonly max: number;
}
/** Holidays are always imperative, whatever `strength` says. */
export interface VacationRule extends RuleBase {
  readonly type: "VACATION";
  readonly from: IsoDate;
  readonly to: IsoDate;
}
export type UnavailableRule = UnavailableAllDayRule | UnavailableHoursRule;
export type SlotRule = UnavailableRule | MaxVisitsRule | VacationRule;
export type AnyRule = SlotRule | PrefDayRule;

export type When =
  | { readonly kind: "FIXED"; readonly date: IsoDate; readonly time: Minutes }
  | {
      readonly kind: "WEEK" | "RANGE";
      readonly from: IsoDate;
      readonly to: IsoDate;
    };

export interface Appointment {
  readonly id: string;
  readonly title: string;
  /** Contact ids; empty for a personal appointment. */
  readonly participants: readonly string[];
  /** "home", "office", "visio", a free place id or a contact's place id. */
  readonly placeId: string;
  readonly dur: number;
  readonly when: When;
  readonly priority: Priority;
}

export type ItemKind = "VISIT" | "APPT";

/** An item of a validated plan: given to people, it never moves on its own. */
export interface ValidatedItem {
  readonly id: string;
  readonly apptId: string | null;
  readonly kind: ItemKind;
  readonly title: string;
  readonly participants: readonly string[];
  readonly personId: string | null;
  /** Snapshot of the place at validation time. */
  readonly place: Place;
  readonly dur: number;
  readonly date: IsoDate;
  readonly start: Minutes;
  readonly end: Minutes;
  readonly priority: Priority;
  readonly earliest: IsoDate;
  readonly latest: IsoDate;
  /** Fixed-time appointment: never movable. */
  readonly fixed: boolean;
  /** The user allowed this item to be shifted for an urgent insertion. */
  readonly movable: boolean;
  /** Shifted once by an insertion (shown as « décalé »). */
  readonly moved: boolean;
}

/** History. A past item marked « N'a pas eu lieu » stays, with `held: false` (« annulé »). */
export interface PastItem {
  readonly id: string;
  readonly apptId: string | null;
  readonly held: boolean;
  readonly kind: ItemKind;
  readonly title: string;
  readonly participants: readonly string[];
  readonly date: IsoDate;
  readonly start: Minutes;
  readonly end: Minutes;
}

export interface Settings {
  readonly home: Place;
  readonly office: Place;
  readonly workDays: readonly IsoDow[];
  readonly dayStart: Minutes;
  /** Wished end of the day, drive home included: may be exceeded, at a cost. */
  readonly dayEnd: Minutes;
  /** Strict limit, drive home included: the planner never goes past it. null = same as `dayEnd`. */
  readonly dayEndLimit: Minutes | null;
  readonly lunch: readonly [Minutes, Minutes] | null;
  readonly visitMinutes: number;
}

export type Answer = "break" | "respect";

/**
 * A proposed block the user dragged elsewhere before validation. It carries
 * everything needed to show it in any period; the planner works around it.
 */
export interface PinnedItem {
  /** Id of the task it pins (visit occurrence or appointment id). */
  readonly id: string;
  readonly kind: ItemKind;
  readonly apptId: string | null;
  readonly personId: string | null;
  readonly title: string;
  readonly participants: readonly string[];
  readonly place: Place;
  readonly dur: number;
  readonly priority: Priority;
  readonly date: IsoDate;
  readonly start: Minutes;
}

export interface PlannerState {
  /** The day the state is seen from: « vu » means validated and on or before this date. */
  readonly today: IsoDate;
  readonly settings: Settings;
  readonly places: readonly Place[];
  readonly rules: readonly SlotRule[];
  readonly contacts: readonly Contact[];
  readonly appointments: readonly Appointment[];
  readonly validated: readonly ValidatedItem[];
  readonly past: readonly PastItem[];
  /** Visit occurrence ids skipped with « Pas cette fois ». */
  readonly skips: readonly string[];
  /** Per-occurrence priority, keyed by visit occurrence id. */
  readonly priorityOverrides: Readonly<Record<string, Priority>>;
  /** Answers to « Important » questions, keyed by rule id. */
  readonly answers: Readonly<Record<string, Answer>>;
  /** « Souhaité » rules whose exception the user refused: they become imperative. */
  readonly refusedExceptions: readonly string[];
  /** Blocks placed by hand before validation. */
  readonly pins: readonly PinnedItem[];
}

/** Road distance and driving time between two places. */
export interface TravelModel {
  km(a: Place, b: Place): number;
  minutes(a: Place, b: Place): number;
}
