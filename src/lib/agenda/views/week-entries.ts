import type { Block, IsoDate, PastItem, PinWarning, PlannedItem, PlannerState, Task, ValidatedItem } from "../../agenda-engine/domain";
import { OCCURRENCE_KEY, nameIndex, participantNames } from "./labels";
import type { EntrySource, EntryView } from "./types";

/** What the entry builders need besides the item itself. */
export type EntryContext = {
  readonly today: IsoDate;
  readonly names: ReadonlyMap<string, string>;
  /** Warnings of the pinned blocks of the day. */
  readonly warnings: readonly PinWarning[];
};

type EntryParts = Pick<EntryView, "source" | "title" | "start" | "end" | "date" | "kind"> & Partial<EntryView>;

const DEFAULTS = {
  itemKey: null,
  occurrenceKey: null,
  subtitle: null,
  priority: null,
  rescheduled: false,
  moved: false,
  warning: null,
  canMove: false,
  canMarkMissed: false,
  canSkip: false,
} as const;

function entry(parts: EntryParts): EntryView {
  const itemKey = parts.itemKey ?? null;
  const key = `${parts.source}:${itemKey ?? parts.title}:${parts.date}:${parts.start}`;
  return { ...DEFAULTS, ...parts, key, itemKey };
}

/** Visits show where they are; appointments show who and where. */
function subtitleOf(kind: "VISIT" | "APPT", participants: readonly string[], placeLabel: string, names: ReadonlyMap<string, string>): string {
  if (kind === "VISIT") return placeLabel;
  return [participantNames(names, participants).join(", "), placeLabel].filter((s) => s !== "").join(" · ");
}

export function validatedEntry(v: ValidatedItem, ctx: EntryContext): EntryView {
  const isPast = v.date < ctx.today;
  return entry({
    source: isPast ? "DONE" : "VALIDATED",
    date: v.date,
    itemKey: v.id,
    kind: v.kind,
    title: v.title,
    subtitle: subtitleOf(v.kind, v.participants, v.place.label, ctx.names),
    start: v.start,
    end: v.end,
    priority: v.priority,
    moved: v.moved,
    // « N'a pas eu lieu » is offered from the day itself (the engine refuses only future items).
    canMarkMissed: v.date <= ctx.today,
  });
}

export function pastEntry(p: PastItem, ctx: EntryContext): EntryView {
  const who = participantNames(ctx.names, p.participants).join(", ");
  return entry({
    source: p.held ? "DONE" : "MISSED",
    date: p.date,
    itemKey: p.id,
    kind: p.kind,
    title: p.title,
    subtitle: who === "" ? null : who,
    start: p.start,
    end: p.end,
  });
}

function taskSubtitle(task: Task, ctx: EntryContext): string {
  return subtitleOf(task.kind, task.participants, task.place.label, ctx.names);
}

/** The occurrence key of a proposed visit, null for anything else. */
function occurrenceOf(task: Task): string | null {
  return task.kind === "VISIT" && OCCURRENCE_KEY.test(task.id) ? task.id : null;
}

export function proposedEntry(date: IsoDate, item: PlannedItem, ctx: EntryContext): EntryView {
  const { task } = item;
  const occurrenceKey = occurrenceOf(task);
  return entry({
    source: "PROPOSED",
    date,
    itemKey: task.id,
    occurrenceKey,
    kind: task.kind,
    title: task.title,
    subtitle: taskSubtitle(task, ctx),
    start: item.start,
    end: item.end,
    priority: task.priority,
    rescheduled: task.rescheduled,
    canMove: true,
    canSkip: occurrenceKey !== null,
  });
}

/** A fixed-time appointment, or a block the user placed by hand (with the warning its position deserves). */
function eventEntry(date: IsoDate, block: Block, task: Task, ctx: EntryContext): EntryView {
  const pinned = task.pinned;
  const warning = pinned ? (ctx.warnings.find((w) => w.taskId === task.id)?.reason ?? null) : null;
  return entry({
    source: pinned ? "PINNED" : "FIXED",
    date,
    itemKey: task.id,
    kind: task.kind,
    title: task.title,
    subtitle: taskSubtitle(task, ctx),
    start: block.s,
    end: block.e,
    priority: task.priority,
    warning,
    canMove: pinned,
  });
}

function plainBlockEntry(date: IsoDate, block: Block, source: EntrySource, subtitle: string | null): EntryView {
  return entry({ source, date, kind: "BLOCK", title: block.label, subtitle, start: block.s, end: block.e });
}

/** Lunch, unavailability and fixed events. Validated items already appear from the planning itself. */
export function blockEntry(date: IsoDate, block: Block, ctx: EntryContext): EntryView | null {
  if (block.kind === "held") return null;
  if (block.kind === "lunch") return plainBlockEntry(date, block, "LUNCH", null);
  if (block.kind === "busy") return plainBlockEntry(date, block, "BUSY", block.place ? "Au bureau" : "Indisponible");
  return block.task ? eventEntry(date, block, block.task, ctx) : null;
}

/** « Ces rendez-vous ont-ils eu lieu ? »: the validated items, oldest first, each with its day. */
export function confirmationEntries(state: PlannerState, items: readonly ValidatedItem[]): EntryView[] {
  const ctx: EntryContext = { today: state.today, names: nameIndex(state), warnings: [] };
  return items
    .map((v) => validatedEntry(v, ctx))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.start - b.start);
}
