"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IsoDate } from "@/lib/agenda/views/types";
import type { PersonOption } from "../appointments/shared-contracts";
import { WeekTab, type DayJump } from "../week/week-tab";
import { MonthView } from "./month-view";

type Scale = "week" | "month";

const SCALES: readonly { readonly value: Scale; readonly label: string; readonly icon: typeof CalendarDays }[] = [
  { value: "week", label: "Semaine", icon: CalendarRange },
  { value: "month", label: "Mois", icon: CalendarDays },
];

type Props = { readonly needsSetup: boolean; readonly persons: readonly PersonOption[] };

/**
 * « Planning »: the week (where the planning is prepared and changed) or the
 * month (indicative). The week stays mounted while the month is shown, so a
 * proposal on screen is never lost.
 */
export function PlanningTab({ needsSetup, persons }: Props) {
  const [scale, setScale] = useState<Scale>("week");
  const [jump, setJump] = useState<DayJump | null>(null);

  function handleOpenWeek(date: IsoDate) {
    setJump((previous) => ({ date, seq: (previous?.seq ?? 0) + 1 }));
    setScale("week");
  }

  return (
    <div className="space-y-4">
      {!needsSetup && <ScaleSwitch value={scale} onChange={setScale} />}
      <div className={cn(scale !== "week" && "hidden")}>
        <WeekTab needsSetup={needsSetup} persons={persons} jumpTo={jump} />
      </div>
      {scale === "month" && !needsSetup && <MonthView onOpenWeek={handleOpenWeek} />}
    </div>
  );
}

function ScaleSwitch({ value, onChange }: { value: Scale; onChange: (scale: Scale) => void }) {
  return (
    <div role="group" aria-label="Affichage du planning" className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {SCALES.map(({ value: scale, label, icon: Icon }) => (
        <button
          key={scale}
          type="button"
          aria-pressed={value === scale}
          onClick={() => onChange(scale)}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === scale ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
