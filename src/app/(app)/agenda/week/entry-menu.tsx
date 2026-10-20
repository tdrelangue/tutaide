"use client";

import type { ReactNode } from "react";
import { CalendarX2, ListChecks, Move, SkipForward, Undo2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EntryView } from "@/lib/agenda/views/types";
import { canHaveNotes } from "../calendar/calendar-format";
import { PRIORITY_LABEL, SOURCE_WORD, WARNING_LABEL, timeRange } from "./format";
import type { DragHandlers } from "./use-pointer-drag";

export type EntryAction = "move" | "unpin" | "skip" | "missed" | "notes";

type EntryMenuProps = {
  readonly entry: EntryView;
  readonly dayLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly disabled: boolean;
  readonly onAction: (action: EntryAction) => void;
  /** Pointer handlers of a movable card (drag); the menu then opens on tap. */
  readonly dragHandlers?: DragHandlers;
  /** The card itself (a button). */
  readonly children: ReactNode;
};

/**
 * Menu of one card: its full details (cards are clipped when short) and what
 * can be done with it. Non-modal so a dialog can open from it cleanly.
 */
export function EntryMenu({ entry, dayLabel, open, onOpenChange, disabled, onAction, dragHandlers, children }: EntryMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild {...dragHandlers}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <EntryDetails entry={entry} dayLabel={dayLabel} />
        <DropdownMenuSeparator />
        <EntryActions entry={entry} disabled={disabled} onAction={onAction} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EntryDetails({ entry, dayLabel }: { entry: EntryView; dayLabel: string }) {
  return (
    <DropdownMenuLabel className="space-y-1 font-normal">
      <span className="block font-semibold">{entry.title}</span>
      <span className="block text-xs text-muted-foreground">
        {dayLabel}, {timeRange(entry.start, entry.end)}
      </span>
      {entry.subtitle && <span className="block text-xs">{entry.subtitle}</span>}
      <span className="block text-xs">
        {SOURCE_WORD[entry.source]}
        {entry.priority && ` · priorité ${PRIORITY_LABEL[entry.priority]}`}
        {entry.moved && " · décalé"}
        {entry.rescheduled && " · à reprogrammer"}
      </span>
      {entry.warning && <span className="block text-xs font-medium">Attention : {WARNING_LABEL[entry.warning]}.</span>}
    </DropdownMenuLabel>
  );
}

function EntryActions({ entry, disabled, onAction }: { entry: EntryView; disabled: boolean; onAction: (action: EntryAction) => void }) {
  const canUnpin = entry.source === "PINNED" && entry.itemKey !== null;
  const canSkip = entry.canSkip && entry.occurrenceKey !== null;
  const canMiss = entry.canMarkMissed && entry.itemKey !== null;
  const hasNotes = canHaveNotes(entry);
  const hasAny = entry.canMove || canUnpin || canSkip || canMiss || hasNotes;
  if (!hasAny) {
    return <DropdownMenuItem disabled>Aucune action pour ce bloc</DropdownMenuItem>;
  }
  return (
    <>
      {entry.canMove && <ActionItem action="move" icon={<Move aria-hidden="true" />} label="Déplacer…" disabled={disabled} onAction={onAction} />}
      {canUnpin && <ActionItem action="unpin" icon={<Undo2 aria-hidden="true" />} label="Rendre au planificateur" disabled={disabled} onAction={onAction} />}
      {canSkip && <ActionItem action="skip" icon={<SkipForward aria-hidden="true" />} label="Pas cette fois" disabled={disabled} onAction={onAction} />}
      {hasNotes && <ActionItem action="notes" icon={<ListChecks aria-hidden="true" />} label="Notes et tâches…" disabled={false} onAction={onAction} />}
      {canMiss && <ActionItem action="missed" icon={<CalendarX2 aria-hidden="true" />} label="N'a pas eu lieu…" disabled={disabled} onAction={onAction} />}
    </>
  );
}

type ActionItemProps = {
  readonly action: EntryAction;
  readonly icon: ReactNode;
  readonly label: string;
  readonly disabled: boolean;
  readonly onAction: (action: EntryAction) => void;
};

function ActionItem({ action, icon, label, disabled, onAction }: ActionItemProps) {
  function handleSelect() {
    onAction(action);
  }
  return (
    <DropdownMenuItem onSelect={handleSelect} disabled={disabled}>
      {icon}
      {label}
    </DropdownMenuItem>
  );
}
