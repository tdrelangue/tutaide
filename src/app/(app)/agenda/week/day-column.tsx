"use client";

import { AlertTriangle, Car, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayView, EntryView, IsoDate, WeekView } from "@/lib/agenda/views/types";
import { EntryCard } from "./entry-card";
import type { EntryAction } from "./entry-menu";
import { dayShort, hm, km, plural, timeRange } from "./format";
import { cardBox, gridHeight, hourMarks, layoutLanes, minutesToPx, type GridRange } from "./grid-geometry";
import type { DragHandlers, DragPreview } from "./use-pointer-drag";

/**
 * One day of the « carnet de tournée », split in three cells (header, body,
 * footer) so every day's rows line up in the week's CSS grid.
 */

export type GridLimits = Pick<WeekView["grid"], "dayEnd" | "dayEndLimit">;

/** Today is framed on its three cells: header ring, side borders, bottom border. */
const TODAY_SIDES = "border-x-2 border-x-primary";

export function DayHeader({ day, compact }: { day: DayView; compact: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1 border-b border-l px-2 py-2",
        day.isToday && "rounded-t-md ring-2 ring-inset ring-primary",
        day.isPast && "bg-muted/50 text-muted-foreground",
      )}
    >
      <h3 className="text-sm font-semibold leading-tight">
        {compact ? <span aria-hidden="true">{dayShort(day.date)}</span> : day.label}
        {compact && <span className="sr-only">{day.label}</span>}
      </h3>
      {day.isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Aujourd&apos;hui</span>}
      {day.offDay && !day.closedLabel && <span className="text-xs">Jour non travaillé</span>}
      {day.closedLabel && (
        <span className="flex items-center gap-1 rounded border border-agenda-warn bg-agenda-warn-soft px-1.5 py-0.5 text-xs font-medium text-foreground">
          <CalendarOff className="h-3 w-3 shrink-0" aria-hidden="true" />
          {day.closedLabel}
        </span>
      )}
    </div>
  );
}

type DayBodyProps = {
  readonly day: DayView;
  readonly range: GridRange;
  readonly limits: GridLimits;
  readonly columnRef: (element: HTMLElement | null) => void;
  readonly preview: DragPreview | null;
  readonly busy: boolean;
  readonly bindDrag: ((entry: EntryView, date: IsoDate, onTap: () => void) => DragHandlers) | null;
  readonly onAction: (action: EntryAction, entry: EntryView, day: DayView) => void;
};

export function DayBody({ day, range, limits, columnRef, preview, busy, bindDrag, onAction }: DayBodyProps) {
  const laned = layoutLanes(day.entries);
  const ghost = preview !== null && preview.date === day.date ? preview : null;
  return (
    <div
      ref={columnRef}
      className={cn("relative border-l bg-agenda-paper", day.isToday && TODAY_SIDES)}
      style={{ height: gridHeight(range) }}
    >
      <HourLines range={range} />
      {day.closedLabel && <div aria-hidden="true" className="agenda-hatch absolute inset-0" />}
      {(day.isPast || day.offDay) && <div aria-hidden="true" className="absolute inset-0 bg-muted/50" />}
      <EndLines range={range} limits={limits} />
      <ol aria-label={`${day.label} : ${plural(day.entries.length, "élément", "éléments")}`} className="absolute inset-0">
        {laned.map(({ item, lane, lanes }) => (
          <EntryCard
            key={item.key}
            entry={item}
            day={day}
            box={{ ...cardBox(item.start, item.end, range), lane, lanes }}
            busy={busy}
            isDragged={preview?.entry.key === item.key}
            bindDrag={bindDrag}
            onAction={onAction}
          />
        ))}
      </ol>
      {ghost && <DragGhost preview={ghost} range={range} />}
    </div>
  );
}

function HourLines({ range }: { range: GridRange }) {
  const marks = hourMarks(range).filter((m) => m < range.to);
  return (
    <div aria-hidden="true">
      {marks.map((m) => (
        <div key={m} className="absolute inset-x-0 border-t border-border" style={{ top: minutesToPx(m, range) }} />
      ))}
    </div>
  );
}

/** Dotted: wished end of day. Solid: strict limit (only when later than the wished end). */
function EndLines({ range, limits }: { range: GridRange; limits: GridLimits }) {
  const hasLimit = limits.dayEndLimit !== null && limits.dayEndLimit > limits.dayEnd;
  return (
    <div aria-hidden="true" className="pointer-events-none">
      <div className="absolute inset-x-0 border-t-2 border-dotted border-agenda-warn" style={{ top: minutesToPx(limits.dayEnd, range) }} />
      {hasLimit && limits.dayEndLimit !== null && (
        <div className="absolute inset-x-0 border-t-2 border-destructive" style={{ top: minutesToPx(limits.dayEndLimit, range) }} />
      )}
    </div>
  );
}

function DragGhost({ preview, range }: { preview: DragPreview; range: GridRange }) {
  const end = preview.start + (preview.entry.end - preview.entry.start);
  const box = cardBox(preview.start, end, range);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md border-2 border-dashed border-primary bg-background/90 px-1.5 py-0.5 text-xs font-semibold shadow-lg"
      style={{ top: box.top, height: box.height }}
    >
      {timeRange(preview.start, end)}
      <span className="block truncate font-normal">{preview.entry.title}</span>
    </div>
  );
}

export function DayFooter({ day }: { day: DayView }) {
  return (
    <div className={cn("space-y-1 border-l border-t px-2 py-1.5 text-xs", day.isToday && `${TODAY_SIDES} rounded-b-md border-b-2 border-b-primary`)}>
      {day.km !== null ? (
        <p className="flex flex-wrap items-center gap-1">
          <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            {km(day.km)}
            {day.finishMin !== null && ` · retour vers ${hm(day.finishMin)}`}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">Pas de trajet</p>
      )}
      {day.unreachable && (
        <p className="flex items-start gap-1 font-medium">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          Arrivées en retard possibles
        </p>
      )}
    </div>
  );
}
