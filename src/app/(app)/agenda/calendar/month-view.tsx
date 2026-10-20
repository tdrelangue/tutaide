"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayView, IsoDate, WeekView } from "@/lib/agenda/views/types";
import { getMonth } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { ERROR_TEXT } from "../address-field";
import { BusyButton } from "../week/busy-button";
import { hm, localToday } from "../week/format";
import { dayOfMonth, isoWeekday, meetingCount, meetingsOf, monthLabel, shiftMonth } from "./calendar-format";
import { DayDetailDialog } from "./day-detail-dialog";

/** Lines shown in a day cell on a wide screen; the rest is « +N ». */
const VISIBLE_LINES = 3;
const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

function useMonthData() {
  const { run, isBusy, error } = useAgendaQuery();
  const [month, setMonth] = useState<IsoDate>(() => shiftMonth(localToday(), 0));
  const [view, setView] = useState<WeekView | null>(null);
  const monthRef = useRef(month);

  const load = useCallback(
    async (first: IsoDate) => {
      const data = await run(() => getMonth(first), { isCurrent: () => monthRef.current === first });
      if (data) setView(data);
    },
    [run],
  );

  useEffect(() => {
    monthRef.current = month;
    void load(month);
  }, [month, load]);

  const go = useCallback((delta: number) => setMonth((m) => shiftMonth(m, delta)), []);
  // « Ce mois-ci » follows the server's today once known.
  const goToday = useCallback(() => setMonth(shiftMonth(view?.today ?? localToday(), 0)), [view]);
  const retry = useCallback(() => void load(monthRef.current), [load]);
  const shown = view !== null && view.from === month ? view : null;
  return { month, view: shown, isBusy, error, go, goToday, retry };
}

/**
 * « Mois »: an indicative calendar. Each day tells how many rendez-vous it
 * holds and, on a wide screen, the first ones (hour and person or title).
 * A day opens its detail; the planning is changed from the week.
 */
export function MonthView({ onOpenWeek }: { onOpenWeek: (date: IsoDate) => void }) {
  const data = useMonthData();
  const [selected, setSelected] = useState<DayView | null>(null);
  function handleOpenWeek(date: IsoDate) {
    setSelected(null);
    onOpenWeek(date);
  }
  function handleClose() {
    setSelected(null);
  }
  return (
    <div className="space-y-3">
      <MonthToolbar label={monthLabel(data.month)} busy={data.isBusy} onPrevious={() => data.go(-1)} onToday={data.goToday} onNext={() => data.go(1)} />
      {data.error && (
        <p role="alert" className={ERROR_TEXT}>
          {data.error}{" "}
          <button type="button" className="underline" onClick={data.retry}>Réessayer</button>
        </p>
      )}
      {data.view ? <MonthGrid view={data.view} onSelect={setSelected} /> : !data.error && <MonthSkeleton />}
      <p className="text-xs text-muted-foreground">
        Vue indicative : touchez un jour pour voir son détail. Pour préparer ou modifier le planning, ouvrez la semaine.
      </p>
      <DayDetailDialog day={selected} onClose={handleClose} onOpenWeek={handleOpenWeek} />
    </div>
  );
}

type ToolbarProps = {
  readonly label: string;
  readonly busy: boolean;
  readonly onPrevious: () => void;
  readonly onToday: () => void;
  readonly onNext: () => void;
};

function MonthToolbar({ label, busy, onPrevious, onToday, onNext }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <BusyButton variant="outline" size="icon" onClick={onPrevious} busy={busy} aria-label="Mois précédent">
          <ChevronLeft aria-hidden="true" />
        </BusyButton>
        <BusyButton variant="outline" onClick={onToday} busy={busy}>
          Ce mois-ci
        </BusyButton>
        <BusyButton variant="outline" size="icon" onClick={onNext} busy={busy} aria-label="Mois suivant">
          <ChevronRight aria-hidden="true" />
        </BusyButton>
      </div>
      <h2 className="text-lg font-semibold tracking-tight" aria-live="polite">
        {label}
      </h2>
    </div>
  );
}

function MonthGrid({ view, onSelect }: { view: WeekView; onSelect: (day: DayView) => void }) {
  const leading = isoWeekday(view.from) - 1;
  return (
    <section aria-label={`Calendrier, ${monthLabel(view.from)}`} className="overflow-hidden rounded-lg border bg-background">
      <div aria-hidden="true" className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((name) => (
          <span key={name} className="py-1.5">
            <span className="sm:hidden">{name.charAt(0).toUpperCase()}</span>
            <span className="hidden capitalize sm:inline">{name.slice(0, 3)}.</span>
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {Array.from({ length: leading }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden="true" className="border-b border-r bg-muted/20" />
        ))}
        {view.days.map((day) => (
          <li key={day.date} className="border-b border-r">
            <DayCell day={day} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function DayCell({ day, onSelect }: { day: DayView; onSelect: (day: DayView) => void }) {
  const meetings = meetingsOf(day);
  const hidden = meetings.length - VISIBLE_LINES;
  function handleClick() {
    onSelect(day);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${day.label}${day.isToday ? ", aujourd'hui" : ""} : ${meetingCount(meetings.length)}`}
      className={cn(
        "flex h-full min-h-16 w-full flex-col gap-1 p-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-28 sm:p-1.5",
        (day.isPast || day.offDay) && "bg-muted/40",
        day.closedLabel && "agenda-hatch",
      )}
    >
      <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:justify-between sm:gap-1">
        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums", day.isToday && "bg-primary text-primary-foreground")}>
          {dayOfMonth(day.date)}
        </span>
        {meetings.length > 0 && (
          <span className="rounded-full bg-agenda-held-soft px-1.5 text-xs font-semibold tabular-nums text-foreground ring-1 ring-agenda-held/40">
            {meetings.length}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
        {meetings.slice(0, VISIBLE_LINES).map((e) => (
          <span key={e.key} className="truncate text-xs">
            <span className="font-medium tabular-nums">{hm(e.start)}</span> {e.title}
          </span>
        ))}
        {hidden > 0 && (
          <span className="text-xs text-muted-foreground">
            +{hidden} autre{hidden > 1 ? "s" : ""}
          </span>
        )}
      </span>
    </button>
  );
}

function MonthSkeleton() {
  return <div role="status" aria-label="Chargement du mois" className="h-96 animate-pulse rounded-lg border bg-muted/40 motion-reduce:animate-none" />;
}
