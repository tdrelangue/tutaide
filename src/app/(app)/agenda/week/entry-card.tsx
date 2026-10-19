"use client";

import { memo, useState, type ComponentType } from "react";
import { AlertTriangle, Ban, CalendarCheck, Check, CircleDashed, CircleSlash, Lock, Pin, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayView, EntrySource, EntryView } from "@/lib/agenda/views/types";
import { PRIORITY_LABEL, SOURCE_WORD, WARNING_LABEL, entryAccessibleName, timeRange } from "./format";
import { EntryMenu, type EntryAction } from "./entry-menu";
import type { BindDrag } from "./use-pointer-drag";

/**
 * Each state is told by shape (bar, dashes, hatching, strike) and a word, never by colour alone.
 * DONE: a muted-foreground border, so the card's edge keeps 3:1 against the paper (WCAG 1.4.11).
 */
const SOURCE_STYLE: Readonly<Record<EntrySource, string>> = {
  VALIDATED: "border border-agenda-held/40 border-l-4 border-l-agenda-held bg-agenda-held-soft",
  PROPOSED: "border-2 border-dashed border-agenda-proposed/60 bg-background",
  PINNED: "border-2 border-agenda-proposed bg-background",
  FIXED: "border border-agenda-fixed/40 border-l-4 border-l-agenda-fixed bg-agenda-fixed-soft",
  DONE: "border border-muted-foreground bg-muted",
  MISSED: "border border-dashed border-agenda-missed bg-muted",
  BUSY: "agenda-hatch border border-agenda-busy bg-agenda-paper",
  LUNCH: "agenda-hatch border border-agenda-busy bg-agenda-paper",
};

const WARNED_PIN_STYLE = "border-2 border-agenda-warn bg-agenda-warn-soft";

/**
 * Small secondary text on cards. text-muted-foreground drops to ≈4.3:1 on the
 * tinted backgrounds (held, fixed, warn, muted): foreground/80 keeps ≥ 4.5:1 (WCAG 1.4.3).
 */
const CARD_SECONDARY_TEXT = "text-foreground/80";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

const SOURCE_ICON: Readonly<Record<EntrySource, IconType>> = {
  VALIDATED: CalendarCheck,
  PROPOSED: CircleDashed,
  PINNED: Pin,
  FIXED: Lock,
  DONE: Check,
  MISSED: CircleSlash,
  BUSY: Ban,
  LUNCH: UtensilsCrossed,
};

export type CardBox = { readonly top: number; readonly height: number; readonly lane: number; readonly lanes: number };

type EntryCardProps = {
  readonly entry: EntryView;
  readonly day: DayView;
  readonly box: CardBox;
  readonly busy: boolean;
  /** Being dragged: the original stays in place, faded, under the ghost. */
  readonly isDragged: boolean;
  readonly bindDrag: BindDrag | null;
  readonly onAction: (action: EntryAction, entry: EntryView, day: DayView) => void;
};

function cardClass(entry: EntryView, draggable: boolean, isDragged: boolean): string {
  return cn(
    "flex h-full w-full flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left text-foreground shadow-sm",
    "focus-visible:relative focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    "hover:z-10 hover:shadow-md motion-safe:transition-shadow",
    entry.source === "PINNED" && entry.warning ? WARNED_PIN_STYLE : SOURCE_STYLE[entry.source],
    draggable && "cursor-grab touch-none active:cursor-grabbing",
    isDragged && "opacity-40",
  );
}

/** Memoised: a drag re-renders the ghost, not every card. */
export const EntryCard = memo(function EntryCard({ entry, day, box, busy, isDragged, bindDrag, onAction }: EntryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const draggable = entry.canMove && bindDrag !== null && !busy;

  function openMenu() {
    setMenuOpen(true);
  }
  function handleAction(action: EntryAction) {
    onAction(action, entry, day);
  }

  // Position comes from the time grid (minutes -> px, lanes -> %): computed, not a design token.
  const position = { top: box.top, height: box.height, left: `${(box.lane / box.lanes) * 100}%`, width: `${100 / box.lanes}%` };
  return (
    <li className="absolute px-0.5" style={position}>
      <EntryMenu
        entry={entry}
        dayLabel={day.label}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        disabled={busy}
        onAction={handleAction}
        dragHandlers={draggable && bindDrag ? bindDrag(entry, day.date, openMenu) : undefined}
      >
        <button
          type="button"
          aria-label={entryAccessibleName(entry, day.label)}
          className={cardClass(entry, draggable, isDragged)}
        >
          <CardBody entry={entry} />
        </button>
      </EntryMenu>
    </li>
  );
});

function CardBody({ entry }: { entry: EntryView }) {
  const Icon = SOURCE_ICON[entry.source];
  return (
    <>
      <span className={cn("flex items-center gap-1 text-xs font-medium", CARD_SECONDARY_TEXT)}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{timeRange(entry.start, entry.end)}</span>
      </span>
      <span className={cn("block truncate text-sm font-semibold leading-tight", entry.source === "MISSED" && "line-through")}>
        {entry.title}
      </span>
      <CardTags entry={entry} />
      {entry.subtitle && <span className={cn("block truncate text-xs", CARD_SECONDARY_TEXT)}>{entry.subtitle}</span>}
      {entry.warning && (
        <span className="mt-0.5 flex items-start gap-1 text-xs font-medium">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-agenda-warn" aria-hidden="true" />
          {WARNING_LABEL[entry.warning]}
        </span>
      )}
    </>
  );
}

function CardTags({ entry }: { entry: EntryView }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs leading-tight">
      <span className="font-medium">{SOURCE_WORD[entry.source]}</span>
      {entry.priority && <PriorityTag priority={entry.priority} />}
      {entry.moved && <span className="rounded border border-agenda-warn px-1">Décalé</span>}
      {entry.rescheduled && <span className="rounded border border-agenda-warn px-1">À reprogrammer</span>}
    </span>
  );
}

function PriorityTag({ priority }: { priority: NonNullable<EntryView["priority"]> }) {
  const isMust = priority === "MUST";
  return (
    <span className={cn("rounded px-1", isMust ? "border-2 border-destructive font-bold" : "border border-border")}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
