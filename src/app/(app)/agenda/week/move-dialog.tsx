"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { minutesToTime, timeToMinutes } from "@/lib/agenda/rules";
import type { DayView, EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { hm, timeRange } from "./format";
import type { GridRange } from "./grid-geometry";

export type MoveTarget = { readonly entry: EntryView; readonly date: IsoDate };

type MoveDialogProps = {
  readonly target: MoveTarget | null;
  readonly days: readonly DayView[];
  readonly range: GridRange;
  readonly onClose: () => void;
  readonly onConfirm: (entry: EntryView, date: IsoDate, start: Minutes) => void;
};

/** « Déplacer… »: the keyboard (and precise) alternative to dragging a proposed block. */
export function MoveDialog({ target, days, range, onClose, onConfirm }: MoveDialogProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        {target && <MoveForm key={target.entry.key} target={target} days={days} range={range} onCancel={onClose} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

type MoveFormProps = Omit<MoveDialogProps, "target" | "onClose"> & { readonly target: MoveTarget; readonly onCancel: () => void };

function checkStart(start: Minutes | null, duration: Minutes, range: GridRange): string | null {
  if (start === null) return "Indiquez une heure valide.";
  const latest = range.to - duration;
  if (start < range.from || start > latest) return `Choisissez une heure entre ${hm(range.from)} et ${hm(latest)}.`;
  return null;
}

function MoveForm({ target, days, range, onCancel, onConfirm }: MoveFormProps) {
  const { entry } = target;
  const [date, setDate] = useState<IsoDate>(target.date);
  const [time, setTime] = useState(minutesToTime(entry.start));
  const [error, setError] = useState<string | null>(null);
  const duration = entry.end - entry.start;

  function handleDateChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setDate(event.target.value);
  }
  function handleTimeChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTime(event.target.value);
  }
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = timeToMinutes(time);
    const problem = checkStart(start, duration, range);
    setError(problem);
    if (problem === null && start !== null) onConfirm(entry, date, start);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Déplacer « {entry.title} »</DialogTitle>
        <DialogDescription>
          Actuellement {timeRange(entry.start, entry.end)}. Le bloc restera où vous le placez ; le reste de la semaine se
          replanifie autour. Rien n&apos;est validé pour autant.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="agenda-move-day">Jour</Label>
          <select
            id="agenda-move-day"
            value={date}
            onChange={handleDateChange}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {days.map((d) => (
              <option key={d.date} value={d.date} disabled={d.isPast}>
                {d.label}
                {d.closedLabel ? ` (${d.closedLabel})` : d.offDay ? " (non travaillé)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="agenda-move-time">Heure de début</Label>
          <Input id="agenda-move-time" type="time" step={900} value={time} onChange={handleTimeChange} aria-describedby={error ? "agenda-move-error" : undefined} />
        </div>
      </div>
      {error && (
        <p id="agenda-move-error" role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit">Placer ici</Button>
      </DialogFooter>
    </form>
  );
}
