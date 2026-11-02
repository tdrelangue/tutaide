"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration } from "@/lib/agenda/rules";

/** The usual lengths; anything else is typed with « Autre… » (Thomas, 2026-11-02). */
export const STANDARD_DURATIONS: readonly number[] = [15, 30, 45, 60, 90, 120];

const SELECT_CLASS =
  "flex h-10 w-44 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const OTHER = "other";
const DEFAULT = "";
const MAX_MINUTES = 8 * 60;

type Props = {
  readonly id: string;
  readonly label: string;
  /** Null = the default (only when `defaultLabel` is given). */
  readonly value: number | null;
  readonly onChange: (minutes: number | null) => void;
  /** « Par défaut (30 min) »: offers null. */
  readonly defaultLabel?: string;
  readonly choices?: readonly number[];
  readonly disabled?: boolean;
  /** Shortest length accepted by the server for this field. */
  readonly min?: number;
};

/** A length: a standard choice, or « Autre… » with the minutes typed by hand. */
export function DurationField({ id, label, value, onChange, defaultLabel, choices = STANDARD_DURATIONS, disabled, min = 5 }: Props) {
  const isStandard = value === null || choices.includes(value);
  const [isOther, setIsOther] = useState(!isStandard);
  const [typed, setTyped] = useState(isStandard ? "" : String(value));
  const selected = isOther ? OTHER : value === null ? DEFAULT : String(value);

  function handleSelect(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setIsOther(next === OTHER);
    if (next === OTHER) {
      const start = value ?? choices[0] ?? 30;
      setTyped(String(start));
      onChange(start);
    } else onChange(next === DEFAULT ? null : Number(next));
  }

  function handleTyped(event: React.ChangeEvent<HTMLInputElement>) {
    setTyped(event.target.value);
    const minutes = Number(event.target.value);
    if (Number.isInteger(minutes) && minutes >= min && minutes <= MAX_MINUTES) onChange(minutes);
  }

  const typedMinutes = Number(typed);
  const isTypedValid = Number.isInteger(typedMinutes) && typedMinutes >= min && typedMinutes <= MAX_MINUTES;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select id={id} value={selected} onChange={handleSelect} disabled={disabled} className={SELECT_CLASS}>
          {defaultLabel !== undefined && <option value={DEFAULT}>{defaultLabel}</option>}
          {choices.map((m) => (
            <option key={m} value={m}>{formatDuration(m)}</option>
          ))}
          <option value={OTHER}>Autre…</option>
        </select>
        {isOther && (
          <>
            <label htmlFor={`${id}-other`} className="sr-only">Durée en minutes</label>
            <Input
              id={`${id}-other`}
              type="number"
              inputMode="numeric"
              min={min}
              max={MAX_MINUTES}
              step={5}
              value={typed}
              onChange={handleTyped}
              disabled={disabled}
              className="w-24"
              aria-invalid={isTypedValid ? "false" : "true"}
              aria-describedby={`${id}-other-hint`}
            />
            <span id={`${id}-other-hint`} className="text-sm text-muted-foreground">
              {isTypedValid ? `minutes (${formatDuration(typedMinutes)})` : `minutes, entre ${min} et ${MAX_MINUTES}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
