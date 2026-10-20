"use client";

import { cn } from "@/lib/utils";
import type { DayView } from "@/lib/agenda/views/types";
import { SOURCE_STYLE } from "../week/entry-card";
import { SOURCE_WORD, timeRange } from "../week/format";
import { meetingCount, meetingsOf } from "./calendar-format";

/**
 * One day, as a list: « 9 h – 10 h  Jean Bonneau · Domicile  Validé ».
 * Read-only; changes are made from the week (its menus and drag).
 */
export function DayEntryList({ day }: { day: DayView }) {
  const meetings = meetingsOf(day);
  const blocks = day.entries.filter((e) => !meetings.includes(e));
  if (day.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{day.offDay ? "Jour non travaillé, rien de prévu." : "Rien de prévu ce jour-là."}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{meetingCount(meetings.length)}</p>
      <ol className="space-y-2">
        {day.entries.map((entry) => (
          <li key={entry.key} className={cn("rounded-md px-3 py-2 text-sm", SOURCE_STYLE[entry.source], blocks.includes(entry) && "opacity-90")}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold tabular-nums">{timeRange(entry.start, entry.end)}</span>
              {SOURCE_WORD[entry.source] !== entry.title && <span className="text-xs font-medium text-foreground/80">{SOURCE_WORD[entry.source]}</span>}
            </p>
            <p className="font-medium">{entry.title}</p>
            {entry.subtitle && <p className="text-xs text-foreground/80">{entry.subtitle}</p>}
          </li>
        ))}
      </ol>
      {day.closedLabel && <p className="text-xs text-muted-foreground">Journée marquée « {day.closedLabel} ».</p>}
    </div>
  );
}
