"use client";

import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DayView, EntryView, IsoDate } from "@/lib/agenda/views/types";
import { DayEntryList } from "./day-entry-list";

type Props = {
  readonly day: DayView | null;
  readonly onClose: () => void;
  /** Opens this day in the week, where the planning is changed. */
  readonly onOpenWeek: (date: IsoDate) => void;
  readonly onOpenNotes: (entry: EntryView, day: DayView) => void;
};

/** The detail of one day, from the month: what is planned, hour by hour. */
export function DayDetailDialog({ day, onClose, onOpenWeek, onOpenNotes }: Props) {
  function handleOpenWeek() {
    if (day) onOpenWeek(day.date);
  }
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }
  return (
    <Dialog open={day !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{day?.label}</DialogTitle>
          <DialogDescription>{day?.isToday ? "Aujourd'hui." : "Le détail de la journée."}</DialogDescription>
        </DialogHeader>
        {day && <DayEntryList day={day} onOpenNotes={(entry) => onOpenNotes(entry, day)} />}
        <Button type="button" variant="outline" onClick={handleOpenWeek} className="w-full sm:w-auto">
          <CalendarRange aria-hidden="true" />
          Ouvrir dans la semaine
        </Button>
      </DialogContent>
    </Dialog>
  );
}
