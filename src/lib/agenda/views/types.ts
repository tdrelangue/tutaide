/**
 * View models of the agenda screens: what the server sends to the page.
 * Plain, serialisable data, built on the server from the engine's results
 * (views/*.ts). No engine object (Task, Contact, Plan) ever reaches the client.
 * Dates are "YYYY-MM-DD", times are minutes after midnight.
 */

export type IsoDate = string;
export type Minutes = number;
export type PriorityValue = "LOW" | "NORMAL" | "HIGH" | "MUST";
export type StrengthValue = "HARD" | "STRONG" | "MEDIUM" | "SOFT";

/** A row the agenda could not use, in plain French without protected-person data. */
export type IssueView = {
  readonly kind: string;
  readonly message: string;
  /** Where to fix it, e.g. "parametres" or "personnes" (tab key). */
  readonly fixTab: string | null;
};

/** Everything shown in one column of the week grid. */
export type EntrySource =
  /** Proposed by the planner, not validated yet (rule 8: not the planning). */
  | "PROPOSED"
  /** Proposed block the user dragged to a time of their choice (rule: kept there). */
  | "PINNED"
  /** In the validated planning, still to come. */
  | "VALIDATED"
  /** Fixed-time appointment not validated yet. */
  | "FIXED"
  /** Validated and past: « Vu le ». */
  | "DONE"
  /** Past item marked « N'a pas eu lieu ». */
  | "MISSED"
  /** Unavailability, at the office, etc. */
  | "BUSY"
  | "LUNCH";

export type PinWarningValue = "CLOSED_DAY" | "OVERLAP" | "LUNCH" | "PAST_LIMIT" | "UNAVAILABLE" | "LATE";

export type EntryView = {
  /** Unique within the week (React key). */
  readonly key: string;
  readonly source: EntrySource;
  /** The item / task id to pass back to actions (pin, missed…); null for BUSY/LUNCH. */
  readonly itemKey: string | null;
  /** Visit occurrence key `<contactId>@<due>` for « Pas cette fois »; null otherwise. */
  readonly occurrenceKey: string | null;
  readonly kind: "VISIT" | "APPT" | "BLOCK";
  readonly title: string;
  /** Second line: place label, participants, or the reason of a busy block. */
  readonly subtitle: string | null;
  readonly start: Minutes;
  readonly end: Minutes;
  readonly priority: PriorityValue | null;
  /** Visit placed again after « N'a pas eu lieu ». */
  readonly rescheduled: boolean;
  /** Validated item shifted once by an urgent insertion (« décalé »). */
  readonly moved: boolean;
  /** For PINNED: why the chosen time breaks a rule (shown, never refused). */
  readonly warning: PinWarningValue | null;
  /** Can be dragged / moved with the « Déplacer… » dialog (PROPOSED, PINNED). */
  readonly canMove: boolean;
  /** Past validated item: « N'a pas eu lieu » is offered. */
  readonly canMarkMissed: boolean;
  /** Proposed visit: « Pas cette fois » is offered. */
  readonly canSkip: boolean;
};

export type DayView = {
  readonly date: IsoDate;
  /** "Lundi 19 octobre". */
  readonly label: string;
  readonly isToday: boolean;
  readonly isPast: boolean;
  /** Not a working day (shown only for what it holds). */
  readonly offDay: boolean;
  /** Imperative closure label (vacation, « Indisponible »), null otherwise. */
  readonly closedLabel: string | null;
  /** Fixed or validated items of the day cannot all be reached on time. */
  readonly unreachable: boolean;
  /** Tour of the day (proposal or validated), null when nothing moves. */
  readonly km: number | null;
  /** Return home, minutes after midnight. */
  readonly finishMin: Minutes | null;
  readonly entries: readonly EntryView[];
};

export type PlanSummary = { readonly placed: number; readonly unplaced: number; readonly km: number };

/** « Important » rule worth breaking: both plans are shown, the user chooses. */
export type QuestionView = {
  readonly ruleKey: string;
  readonly label: string;
  readonly strength: StrengthValue;
  readonly answer: "respect" | "break" | null;
  readonly respect: PlanSummary;
  readonly exception: PlanSummary;
  readonly gainKm: number;
  /** How many more items the exception places. */
  readonly placesMore: number;
};

export type UnplacedReasonValue = "NO_COMMON_SLOT" | "NO_FREE_DAY" | "UNKNOWN_PLACE" | "NO_ADDRESS" | "INVALID_FREQUENCY";

export type ProblemView = {
  readonly title: string;
  readonly priority: PriorityValue;
  readonly reason: UnplacedReasonValue | "LATE";
  /** For LATE: placed this many days after its due date. */
  readonly lateDays: number | null;
  /** « Incontournable » not placed: shown as an alert. */
  readonly isAlert: boolean;
};

/** « Souhaité » rule not honoured; the user may refuse the exception. */
export type BentView = { readonly ruleKey: string; readonly label: string; readonly title: string; readonly date: IsoDate };

export type ProposalMeta = {
  /** Sent back with « Valider la semaine ». */
  readonly fingerprint: string;
  readonly placedCount: number;
  readonly totalKm: number;
  /** Road times estimated because IGN did not answer. */
  readonly estimatedRouteCount: number;
  readonly questions: readonly QuestionView[];
  readonly problems: readonly ProblemView[];
  readonly bent: readonly BentView[];
  /** Low-priority visits postponed quietly. */
  readonly postponed: readonly { readonly title: string; readonly due: IsoDate }[];
  /** « Si possible » preferences not followed. */
  readonly softMissed: readonly { readonly label: string; readonly date: IsoDate }[];
};

export type WeekView = {
  readonly today: IsoDate;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly grid: {
    /** Visible hours (minutes): 07:30–20:30 by default. */
    readonly from: Minutes;
    readonly to: Minutes;
    /** Wished end of day (dotted line). */
    readonly dayEnd: Minutes;
    /** Strict limit (solid line), null = same as dayEnd. */
    readonly dayEndLimit: Minutes | null;
  };
  readonly days: readonly DayView[];
  /** Null until « Préparer une proposition ». */
  readonly proposal: ProposalMeta | null;
  readonly issues: readonly IssueView[];
};

/** A validated item, as listed in insertion dialogs. */
export type ItemRef = {
  readonly itemKey: string;
  readonly title: string;
  readonly date: IsoDate;
  readonly start: Minutes;
  readonly fixed: boolean;
};

export type SlotView = { readonly date: IsoDate; readonly start: Minutes; readonly end: Minutes };

/** Rule 12: what happens to a new appointment. */
export type InsertView =
  /** Before validation: simply added, the next proposal places it by priority. */
  | { readonly kind: "LISTED"; readonly appointmentId: string }
  /** Its dates touch the validated plan: free slots first, nothing moves. */
  | {
      readonly kind: "NEEDS_INSERT";
      readonly appointmentId: string;
      readonly options: readonly (SlotView & { readonly addKm: number })[];
      readonly conflicts: readonly ItemRef[];
      /** Future validated items the user may allow to move. */
      readonly candidates: readonly ItemRef[];
    }
  | { readonly kind: "NOT_PLANNABLE"; readonly issues: readonly IssueView[] }
  | { readonly kind: "UNPLANNABLE"; readonly appointmentId: string; readonly issues: readonly IssueView[] };

/** Exactly what an insertion with moves would change, shown before applying. */
export type MovesPreview = {
  readonly fingerprint: string;
  readonly placement: SlotView | null;
  readonly changes: readonly {
    readonly itemKey: string;
    readonly title: string;
    readonly from: { readonly date: IsoDate; readonly start: Minutes };
    /** Null: no longer fits anywhere, would leave the planning (explicit confirmation). */
    readonly to: SlotView | null;
  }[];
  /** Labels of « Souhaité » rules bent by the insertion. */
  readonly bent: readonly string[];
  readonly hasRemovals: boolean;
};

export type AppointmentStatus = "A_PLACER" | "PREVU" | "FAIT" | "ANNULE";

export type WhenView =
  | { readonly kind: "FIXED"; readonly date: IsoDate; readonly timeMin: Minutes }
  | { readonly kind: "WEEK" | "RANGE"; readonly from: IsoDate; readonly to: IsoDate };

export type AppointmentRow = {
  readonly id: string;
  readonly title: string;
  readonly participantNames: readonly string[];
  readonly placeLabel: string;
  readonly durationMin: number;
  readonly when: WhenView;
  readonly priority: PriorityValue;
  readonly status: AppointmentStatus;
  /** Date of its validated item, if any. */
  readonly scheduledOn: IsoDate | null;
};

/** « Vu le / Prévu le / Prochaine visite » of a protected person. */
export type VisitStatusRow = {
  readonly personId: string;
  /** Last visit held (validated and past), or the last visit on file. */
  readonly seenOn: IsoDate | null;
  /** Next validated visit or appointment with the person still to come. */
  readonly plannedOn: IsoDate | null;
  /** When the next regular visit is due. */
  readonly nextDue: IsoDate | null;
  readonly paused: boolean;
};

/** Result of an /agenda action that returns data. */
export type AgendaDataResult<T> =
  | { readonly success: true; readonly data: T; readonly message?: string }
  | { readonly success: false; readonly error: string; readonly issues?: readonly IssueView[] };
