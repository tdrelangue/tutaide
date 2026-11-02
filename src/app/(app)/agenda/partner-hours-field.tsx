"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { minutesToTime, timeToMinutes } from "@/lib/agenda/rules";

/** One opening slot as typed: days, and « 09:00 » / « 12:00 ». */
export type HoursDraft = { readonly key: number; readonly dows: readonly number[]; readonly from: string; readonly to: string };

const DAYS: readonly { dow: number; short: string; long: string }[] = [
  { dow: 1, short: "L", long: "lundi" },
  { dow: 2, short: "M", long: "mardi" },
  { dow: 3, short: "M", long: "mercredi" },
  { dow: 4, short: "J", long: "jeudi" },
  { dow: 5, short: "V", long: "vendredi" },
  { dow: 6, short: "S", long: "samedi" },
  { dow: 7, short: "D", long: "dimanche" },
];

const MAX_SLOTS = 7;
const WEEKDAYS = [1, 2, 3, 4, 5];

export function hoursToDrafts(hours: readonly { dows: number[]; fromMin: number; toMin: number }[]): HoursDraft[] {
  return hours.map((h, key) => ({ key, dows: h.dows, from: minutesToTime(h.fromMin), to: minutesToTime(h.toMin) }));
}

/** The slots to send, or the first problem in words. */
export function draftsToHours(drafts: readonly HoursDraft[]): { hours: { dows: number[]; fromMin: number; toMin: number }[] } | { error: string } {
  const hours = [];
  for (const d of drafts) {
    const fromMin = timeToMinutes(d.from);
    const toMin = timeToMinutes(d.to);
    if (d.dows.length === 0) return { error: "Cochez au moins un jour pour chaque plage horaire." };
    if (fromMin === null || toMin === null) return { error: "Indiquez les heures de chaque plage horaire." };
    if (toMin <= fromMin) return { error: "Une plage horaire doit finir après son début." };
    hours.push({ dows: [...d.dows], fromMin, toMin });
  }
  return { hours };
}

type Props = {
  value: readonly HoursDraft[];
  onChange: (drafts: HoursDraft[]) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * « Horaires d'ouverture » of a contact (« lun.–ven. 9 h–12 h et 14 h–18 h »):
 * appointments with this contact are placed inside them. None = no constraint.
 */
export function PartnerHoursField({ value, onChange, error, disabled }: Props) {
  const errorId = useId();

  function addSlot() {
    const key = Math.max(-1, ...value.map((d) => d.key)) + 1;
    onChange([...value, { key, dows: WEEKDAYS, from: "09:00", to: "12:00" }]);
  }

  function updateSlot(key: number, patch: Partial<HoursDraft>) {
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeSlot(key: number) {
    onChange(value.filter((d) => d.key !== key));
  }

  return (
    <fieldset className="space-y-2" disabled={disabled} aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium">Horaires d&apos;ouverture <span className="font-normal text-muted-foreground">(facultatif)</span></legend>
      <p className="text-xs text-muted-foreground">Les rendez-vous avec ce contact seront placés dans ces horaires. Sans horaires, aucune contrainte.</p>
      {value.map((slot, i) => (
        <SlotRow key={slot.key} slot={slot} index={i} onUpdate={updateSlot} onRemove={removeSlot} />
      ))}
      {value.length < MAX_SLOTS && (
        <Button type="button" variant="outline" size="sm" onClick={addSlot}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Ajouter une plage horaire
        </Button>
      )}
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </fieldset>
  );
}

type SlotRowProps = {
  slot: HoursDraft;
  index: number;
  onUpdate: (key: number, patch: Partial<HoursDraft>) => void;
  onRemove: (key: number) => void;
};

function SlotRow({ slot, index, onUpdate, onRemove }: SlotRowProps) {
  const label = `Plage ${index + 1}`;

  function toggleDay(dow: number) {
    const dows = slot.dows.includes(dow) ? slot.dows.filter((d) => d !== dow) : [...slot.dows, dow].sort((a, b) => a - b);
    onUpdate(slot.key, { dows });
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <div className="flex gap-1">
        {DAYS.map((day) => {
          const isOn = slot.dows.includes(day.dow);
          return (
            <button
              key={day.dow}
              type="button"
              aria-pressed={isOn}
              aria-label={day.long}
              onClick={() => toggleDay(day.dow)}
              className={cn("h-8 w-8 rounded-full border text-xs font-medium", isOn ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}
            >
              {day.short}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1 text-sm">
        de
        <input
          type="time"
          value={slot.from}
          onChange={(event) => onUpdate(slot.key, { from: event.target.value })}
          aria-label={`${label}, ouverture`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-1 text-sm">
        à
        <input
          type="time"
          value={slot.to}
          onChange={(event) => onUpdate(slot.key, { to: event.target.value })}
          aria-label={`${label}, fermeture`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        />
      </label>
      <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(slot.key)} aria-label={`Retirer la ${label.toLowerCase()}`} className="ml-auto">
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
