"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DayView, EntryView, IsoDate, Minutes, WeekView } from "@/lib/agenda/views/types";
import { CompactWeek } from "../calendar/compact-week";
import { DayBody, DayFooter, DayHeader, type GridLimits } from "./day-column";
import type { EntryAction } from "./entry-menu";
import { hm, weekLabel } from "./format";
import { gridHeight, hourMarks, minutesToPx, type GridRange } from "./grid-geometry";
import { useMediaQuery } from "./use-media-query";
import { usePointerDrag } from "./use-pointer-drag";

/** Under 640 px the week is a compact list of days; a day opens on its own, with a day pager. */
const NARROW_QUERY = "(max-width: 639px)";
/** Hour labels this close to an end-of-day line are hidden so labels never overlap. */
const LABEL_CLEARANCE_MIN = 20;

type WeekGridProps = {
  readonly view: WeekView;
  readonly busy: boolean;
  readonly onEntryAction: (action: EntryAction, entry: EntryView, day: DayView) => void;
  readonly onDrop: (entry: EntryView, date: IsoDate, start: Minutes) => void;
  /** Day to open directly on a phone (coming from the month); otherwise the compact week shows first. */
  readonly focusDate?: IsoDate | null;
};

function focusIndex(days: readonly DayView[], focusDate: IsoDate | null | undefined): number | null {
  const index = focusDate ? days.findIndex((d) => d.date === focusDate) : -1;
  return index === -1 ? null : index;
}

/** Column widths: hour rail, then working days wide and days off narrow (layout values, not design tokens). */
function columnTemplate(days: readonly DayView[], isNarrow: boolean): string {
  if (isNarrow) return "3.5rem minmax(0, 1fr)";
  return ["4rem", ...days.map((d) => (d.offDay ? "minmax(3.5rem, 0.45fr)" : "minmax(6.5rem, 1fr)"))].join(" ");
}

/** The « carnet de tournée »: hour rail and paper day columns. Keyed by week, so the pager resets. */
export function WeekGrid({ view, busy, onEntryAction, onDrop, focusDate }: WeekGridProps) {
  const isNarrow = useMediaQuery(NARROW_QUERY);
  /** Phone only: the day opened from the compact week, null = the compact week. */
  const [dayIndex, setDayIndex] = useState<number | null>(() => focusIndex(view.days, focusDate));
  // Stable while the hours do not change, so memoised day columns skip re-rendering during a drag.
  const range = useMemo<GridRange>(() => ({ from: view.grid.from, to: view.grid.to }), [view.grid.from, view.grid.to]);
  // A new view (reload, recomputed proposal) cancels a drag whose entry may be gone.
  const drag = usePointerDrag({ range, disabled: busy, resetKey: view, onDrop });
  const draggedKey = drag.preview?.entry.key ?? null;
  const index = Math.min(dayIndex ?? 0, Math.max(0, view.days.length - 1));
  const days = isNarrow ? view.days.slice(index, index + 1) : view.days;

  if (isNarrow && dayIndex === null) {
    return (
      <section aria-label={`Planning, ${weekLabel(view.from, view.to)}`} className="overflow-hidden rounded-lg border bg-background">
        <CompactWeek days={view.days} onOpenDay={setDayIndex} />
      </section>
    );
  }

  return (
    <section aria-label={`Planning, ${weekLabel(view.from, view.to)}`} className="overflow-hidden rounded-lg border bg-background">
      {isNarrow && <DayPager days={view.days} index={index} onChange={setDayIndex} onBack={() => setDayIndex(null)} />}
      <div className="overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: columnTemplate(days, isNarrow) }}>
          <div className="sticky left-0 z-20 border-b bg-background" />
          {days.map((day) => (
            <DayHeader key={day.date} day={day} compact={day.offDay && !isNarrow} />
          ))}
          <HourRail range={range} limits={view.grid} />
          {days.map((day) => (
            <DayBody key={day.date} day={day} range={range} limits={view.grid} registerColumn={drag.registerColumn} ghost={drag.preview?.date === day.date ? drag.preview : null} draggedKey={draggedKey} busy={busy} bindDrag={drag.bind} onAction={onEntryAction} />
          ))}
          <div className="sticky left-0 z-20 border-t bg-background" />
          {days.map((day) => (
            <DayFooter key={day.date} day={day} />
          ))}
        </div>
      </div>
    </section>
  );
}

function isNearLine(m: Minutes, limits: GridLimits): boolean {
  const lines = [limits.dayEnd, limits.dayEndLimit].filter((l): l is Minutes => l !== null);
  return lines.some((line) => Math.abs(line - m) < LABEL_CLEARANCE_MIN);
}

/** Sticky hour labels, plus the names of the two end-of-day lines (also explained in the legend). */
function HourRail({ range, limits }: { range: GridRange; limits: GridLimits }) {
  const marks = hourMarks(range).filter((m) => m < range.to && !isNearLine(m, limits));
  const hasLimit = limits.dayEndLimit !== null && limits.dayEndLimit > limits.dayEnd;
  return (
    <div aria-hidden="true" className="sticky left-0 z-20 bg-background text-xs text-muted-foreground" style={{ height: gridHeight(range) }}>
      {marks.map((m) => (
        <span key={m} className="absolute right-1.5 -translate-y-1/2 tabular-nums" style={{ top: minutesToPx(m, range) }}>
          {hm(m)}
        </span>
      ))}
      <RailLabel top={minutesToPx(limits.dayEnd, range)} text="Fin souhaitée" />
      {hasLimit && limits.dayEndLimit !== null && <RailLabel top={minutesToPx(limits.dayEndLimit, range)} text="Limite" />}
    </div>
  );
}

function RailLabel({ top, text }: { top: number; text: string }) {
  return (
    <span className="absolute inset-x-1 -translate-y-1/2 text-right font-medium leading-none text-foreground" style={{ top }}>
      {text}
    </span>
  );
}

type DayPagerProps = { days: readonly DayView[]; index: number; onChange: (index: number) => void; onBack: () => void };

function DayPager({ days, index, onChange, onBack }: DayPagerProps) {
  function handlePrevious() {
    onChange(Math.max(0, index - 1));
  }
  function handleNext() {
    onChange(Math.min(days.length - 1, index + 1));
  }
  return (
    <div className="space-y-2 border-b p-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-1">
        <ArrowLeft aria-hidden="true" />
        Toute la semaine
      </Button>
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="icon" onClick={handlePrevious} disabled={index === 0} aria-label="Jour précédent">
        <ChevronLeft aria-hidden="true" />
      </Button>
      <p className="text-center text-sm font-semibold" aria-live="polite">
        {days[index]?.label}
        <span className="block text-xs font-normal text-muted-foreground">
          Jour {index + 1} sur {days.length}
        </span>
      </p>
      <Button variant="outline" size="icon" onClick={handleNext} disabled={index >= days.length - 1} aria-label="Jour suivant">
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
    </div>
  );
}
