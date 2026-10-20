"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayView } from "@/lib/agenda/views/types";
import { SOURCE_WORD, timeRange } from "../week/format";
import { dayOfMonth, meetingCount, meetingsOf, weekdayInitial } from "./calendar-format";

/**
 * The week on a phone: one line per day (initial and number), its rendez-vous
 * as « 9 h – 10 h  Jean Bonneau ». Indicative only; a day opens its detail,
 * where blocks can be moved and marked as on a computer.
 */
export function CompactWeek({ days, onOpenDay }: { days: readonly DayView[]; onOpenDay: (index: number) => void }) {
  return (
    <ol aria-label="Jours de la semaine" className="divide-y">
      {days.map((day, index) => (
        <li key={day.date}>
          <CompactDay day={day} onOpen={() => onOpenDay(index)} />
        </li>
      ))}
    </ol>
  );
}

function CompactDay({ day, onOpen }: { day: DayView; onOpen: () => void }) {
  const meetings = meetingsOf(day);
  const { initial } = weekdayInitial(day.date);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${day.label}${day.isToday ? ", aujourd'hui" : ""} : ${meetingCount(meetings.length)}. Ouvrir le détail.`}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        (day.isPast || day.offDay) && "bg-muted/40",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex w-9 shrink-0 flex-col items-center rounded-md py-1 text-xs font-semibold leading-tight",
          day.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        <span>{initial}</span>
        <span className="tabular-nums">{dayOfMonth(day.date)}</span>
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1 space-y-0.5">
        {meetings.length === 0 ? (
          <span className="block py-1 text-sm text-muted-foreground">{day.closedLabel ?? (day.offDay ? "Non travaillé" : "Rien de prévu")}</span>
        ) : (
          meetings.map((e) => (
            <span key={e.key} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-medium tabular-nums">{timeRange(e.start, e.end)}</span>
              <span className="truncate">{e.title}</span>
              {e.source === "PROPOSED" || e.source === "FIXED" || e.source === "MISSED" ? (
                <span className="shrink-0 text-xs text-muted-foreground">{SOURCE_WORD[e.source]}</span>
              ) : null}
            </span>
          ))
        )}
      </span>
      <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
