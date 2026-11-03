"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DayPart } from "@/lib/agenda/day-actions";
import type { DayView } from "@/lib/agenda/views/types";
import { InlineError } from "../appointments/inline-error";
import { getOfficeDay, rescheduleDayPart, saveOfficeDay } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { BusyButton } from "./busy-button";
import { addDays } from "./format";

const PART_LABELS: Readonly<Record<DayPart, string>> = { MORNING: "Le matin", AFTERNOON: "L'après-midi", DAY: "Toute la journée" };
const PARTS: readonly DayPart[] = ["MORNING", "AFTERNOON", "DAY"];

type Props = {
  readonly day: DayView | null;
  readonly onClose: () => void;
  /** Called after a change: the caller reloads the week. */
  readonly onDone: () => void;
};

/**
 * One day of the week (Thomas, 2026-11-03): « au bureau ce jour-là » (her
 * assistant is in, a one-off — the weekly rules stay in Paramètres), and
 * « reprogrammer » a morning, an afternoon or the day to another date.
 */
export function DayDialog({ day, onClose, onDone }: Props) {
  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {day && (
          <>
            <DialogHeader>
              <DialogTitle>{day.label}</DialogTitle>
              <DialogDescription>Ce qui vaut pour ce jour-là seulement.</DialogDescription>
            </DialogHeader>
            <OfficeSection key={`o-${day.date}`} day={day} onDone={onDone} />
            <RescheduleSection key={`r-${day.date}`} day={day} onDone={onDone} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OfficeSection({ day, onDone }: { readonly day: DayView; readonly onDone: () => void }) {
  const name = useId();
  const [part, setPart] = useState<DayPart | null>(null);
  const load = useAgendaQuery();
  const save = useAgendaQuery();
  const { run } = load;
  useEffect(() => {
    void run(() => getOfficeDay(day.date)).then((current) => setPart(current ?? null));
  }, [day.date, run]);

  async function handleSave() {
    const done = await save.run(() => saveOfficeDay(day.date, part));
    if (done === null) return;
    toast.success(part === null ? "Plus de demi-journée au bureau ce jour-là." : "Noté : le planificateur garde ce temps pour le bureau.");
    onDone();
  }
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Au bureau ce jour-là</legend>
      <p className="text-xs text-muted-foreground">Par exemple quand votre assistante est là. Le planificateur n&apos;y place pas de visite, sauf si vous l&apos;acceptez quand il vous le demande.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[null, ...PARTS].map((p) => (
          <label key={p ?? "none"} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} checked={part === p} onChange={() => setPart(p)} className="h-4 w-4 accent-primary" />
            {p === null ? "Non" : PART_LABELS[p]}
          </label>
        ))}
      </div>
      <InlineError message={save.error ?? load.error} issues={save.issues} focusOnShow />
      <BusyButton type="button" size="sm" onClick={handleSave} busy={save.isBusy}>Enregistrer</BusyButton>
    </fieldset>
  );
}

function RescheduleSection({ day, onDone, onClose }: { readonly day: DayView; readonly onDone: () => void; readonly onClose: () => void }) {
  const id = useId();
  const [part, setPart] = useState<DayPart>("DAY");
  const [to, setTo] = useState(addDays(day.date, 7));
  const move = useAgendaQuery();

  async function handleMove() {
    const report = await move.run(() => rescheduleDayPart(day.date, part, to));
    if (report === null) return;
    const kept = report.kept > 0 ? ` ${report.kept} sont restés (heure fixe, ou déjà occupé ce jour-là) : déplacez-les un par un.` : "";
    toast.success(`${report.moved} rendez-vous déplacé${report.moved > 1 ? "s" : ""}.${kept}`, { duration: 10_000 });
    onDone();
    onClose();
  }
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Reprogrammer</legend>
      <p className="text-xs text-muted-foreground">La tournée validée part telle quelle, mêmes heures, même ordre. Les rendez-vous à heure fixe restent : changez-les avec « Modifier ».</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-part`}>Quoi</Label>
          <select id={`${id}-part`} value={part} onChange={(e) => setPart(PARTS.find((p) => p === e.target.value) ?? "DAY")} className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {PARTS.map((p) => <option key={p} value={p}>{PART_LABELS[p]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>Vers le</Label>
          <Input id={`${id}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <Button type="button" variant="outline" onClick={() => void handleMove()} disabled={move.isBusy || to === ""}>
          Reprogrammer
        </Button>
      </div>
      <InlineError message={move.error} issues={move.issues} focusOnShow />
    </fieldset>
  );
}
