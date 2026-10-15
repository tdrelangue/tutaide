import type {
  Contact,
  IsoDate,
  ItemKind,
  Minutes,
  Place,
  Priority,
  SlotRule,
  PrefDayRule,
} from "./model";

/** Something the planner must place: a regular visit, an appointment or a movable validated item. */
export interface Task {
  readonly id: string;
  readonly kind: ItemKind;
  readonly title: string;
  readonly apptId: string | null;
  readonly participants: readonly string[];
  readonly person: Contact | null;
  readonly place: Place;
  readonly dur: number;
  readonly priority: Priority;
  readonly earliest: IsoDate;
  readonly latest: IsoDate;
  /** Date the item is ideally held on. */
  readonly due: IsoDate;
  /** A regular visit already late at the start of the period. */
  readonly overdue: boolean;
  /** Must stay inside [earliest, latest]: never placed late. */
  readonly strict: boolean;
  /** Fixed start time (fixed-time appointment being inserted). */
  readonly fixedStart: Minutes | null;
  /** Date of the validated item this task moves; null otherwise. */
  readonly originalDate: IsoDate | null;
  readonly originalStart: Minutes | null;
  /** Replaces a visit marked « N'a pas eu lieu »: never postponed quietly. */
  readonly rescheduled: boolean;
  /** Placed by hand by the user (dragged): it stays where it is. */
  readonly pinned: boolean;
}

export type BlockKind = "lunch" | "busy" | "event" | "held";

/** A time span of the day the planner works around. */
export interface Block {
  readonly s: Minutes;
  readonly e: Minutes;
  readonly label: string;
  readonly kind: BlockKind;
  /** Where the user must be; null = anywhere (lunch, unavailability at home). */
  readonly place: Place | null;
  readonly ruleId: string | null;
  readonly task: Task | null;
}

export interface Day {
  readonly date: IsoDate;
  readonly start: Minutes;
  readonly end: Minutes;
  /** Not a working day: kept only to show the fixed or validated items it holds; nothing is planned on it. */
  readonly offDay: boolean;
  readonly blocks: readonly Block[];
  /** Imperative closure (vacation, unavailability). */
  readonly closed: SlotRule | null;
  /** « Souhaité » closure: usable only to avoid dropping a non-low item. */
  readonly softClosed: SlotRule | null;
  readonly cap: number | null;
  readonly capSoft: { readonly max: number; readonly rule: SlotRule } | null;
  readonly capCost: { readonly max: number; readonly rule: SlotRule } | null;
  /** « Si possible » cost of using this day. */
  readonly penalty: number;
}

export interface PlannedItem {
  readonly task: Task;
  readonly start: Minutes;
  readonly end: Minutes;
}

export interface Simulation {
  readonly items: readonly PlannedItem[];
  readonly km: number;
  readonly finish: Minutes;
}

export type UnplacedReason =
  | "NO_COMMON_SLOT"
  | "NO_FREE_DAY"
  | "UNKNOWN_PLACE"
  | "NO_ADDRESS"
  | "INVALID_FREQUENCY";

export interface Unplaced {
  readonly task: Task | null;
  readonly apptId: string | null;
  /** Protected person whose visits cannot be planned (no address). */
  readonly personId: string | null;
  readonly priority: Priority;
  readonly reason: UnplacedReason;
}
export interface LateItem {
  readonly task: Task;
  readonly date: IsoDate;
  readonly days: number;
}
/** A « Souhaité » rule bent to avoid dropping a non-low item. */
export interface BentRule {
  readonly rule: SlotRule | PrefDayRule;
  readonly task: Task;
  readonly date: IsoDate;
}

/** What is wrong with where the user put a block: shown, never enforced. */
export type PinWarningReason =
  "CLOSED_DAY" | "OVERLAP" | "LUNCH" | "PAST_LIMIT" | "UNAVAILABLE" | "LATE";

export interface PinWarning {
  readonly taskId: string;
  readonly title: string;
  readonly date: IsoDate;
  readonly reason: PinWarningReason;
}

export interface PlannedDay {
  readonly date: IsoDate;
  readonly items: readonly PlannedItem[];
  readonly blocks: readonly Block[];
  readonly km: number;
  readonly finish: Minutes;
  readonly closed: SlotRule | null;
  /** Not a working day, shown only for the fixed or validated items it holds. */
  readonly offDay: boolean;
  /** Fixed or validated items of this day cannot all be reached on time. */
  readonly unreachable: boolean;
}

export interface Plan {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly days: readonly PlannedDay[];
  readonly late: readonly LateItem[];
  readonly unplaced: readonly Unplaced[];
  readonly bent: readonly BentRule[];
  /** Low-priority visits postponed quietly. */
  readonly postponed: readonly Task[];
  /** « Si possible » / « Souhaité » preferred days not honoured. */
  readonly softMissed: readonly BentRule[];
  /** Incontournable items that could not be placed: must be shown as an alert. */
  readonly alerts: readonly Unplaced[];
  /** Blocks placed by hand whose position breaks a rule. */
  readonly pinWarnings: readonly PinWarning[];
  readonly totalKm: number;
}

/** Options that change which rules bind during one solve. */
export interface RuleOptions {
  /** « Important » rules the user agreed to break. */
  readonly relaxed: ReadonlySet<string>;
  /** « Souhaité » rules whose exception was refused. */
  readonly refused: ReadonlySet<string>;
}

export interface Question {
  readonly rule: SlotRule | PrefDayRule;
  readonly respect: Plan;
  readonly exception: Plan;
  readonly gainKm: number;
  readonly gainTrouble: number;
}

export interface Proposal {
  readonly plan: Plan;
  readonly base: Plan;
  readonly questions: readonly Question[];
}
