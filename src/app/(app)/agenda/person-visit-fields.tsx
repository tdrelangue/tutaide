"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EHPAD_VISIT_FROM, EHPAD_VISIT_TO, findEhpad, mentionsEhpad } from "@/lib/agenda/ehpad";
import { PERIOD_LABELS, minutesToTime, toEveryForm, type AgendaPeriodValue } from "@/lib/agenda/rules";
import type { AgendaPersonView, Place } from "@/lib/agenda/service";
import { ERROR_TEXT } from "./address-field";

const SELECT_CLASS =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PERIODS = Object.keys(PERIOD_LABELS) as AgendaPeriodValue[]; // the PERIOD_LABELS keys are the periods
const MAX_EVERY = 52;

type FrequencyColumns = { visitsPerPeriod: number | null; visitPeriod: AgendaPeriodValue | null; visitEvery: number };

/** « Tous les N <unité> ». `kept`: an older « 2 visites par mois » left untouched is saved as it was. */
export type Frequency = {
  readonly every: number | null;
  readonly typed: string;
  readonly period: AgendaPeriodValue;
  readonly kept: FrequencyColumns | null;
  /** « Pas de visite régulière » (Thomas, 2026-11-02). */
  readonly isNone: boolean;
};

/** The frequency columns: unchanged when the form kept an older « 2 visites par mois ». */
export function frequencyPayload(f: Frequency): FrequencyColumns {
  if (f.isNone) return { visitsPerPeriod: null, visitPeriod: null, visitEvery: 1 };
  if (f.kept) return f.kept;
  return { visitsPerPeriod: 1, visitPeriod: f.period, visitEvery: f.every ?? 1 };
}

export function initialFrequency(person: AgendaPersonView | null): Frequency {
  const isNone = person !== null && person.visitPeriod === null;
  const count = person?.visitsPerPeriod ?? 1;
  const period = person?.visitPeriod ?? "QUARTER";
  const every = person?.visitEvery ?? 1;
  const shown = toEveryForm(count, period, every);
  const kept = count > 1 ? { visitsPerPeriod: count, visitPeriod: period, visitEvery: every } : null;
  return { every: shown.every, typed: String(shown.every), period: shown.period, kept, isNone };
}

type FrequencyProps = {
  readonly value: Frequency;
  readonly onChange: (value: Frequency) => void;
  readonly error?: string;
  readonly disabled: boolean;
};

/** « Une visite tous les [2] [mois] » (Thomas, 2026-11-02). */
export function FrequencyField({ value, onChange, error, disabled }: FrequencyProps) {
  function handleEveryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const n = Number(event.target.value);
    const every = event.target.value !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_EVERY ? n : null;
    onChange({ ...value, typed: event.target.value, every, kept: null });
  }
  function handlePeriodChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const period = PERIODS.find((p) => p === event.target.value);
    if (period) onChange({ ...value, period, kept: null });
  }
  function handleNoneChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, isNone: event.target.value === "none" });
  }
  const label = PERIOD_LABELS[value.period];
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">Fréquence des visites</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="person-regular" value="regular" checked={!value.isNone} onChange={handleNoneChange} className="h-4 w-4 accent-primary" />
          Visites régulières
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="person-regular" value="none" checked={value.isNone} onChange={handleNoneChange} className="h-4 w-4 accent-primary" />
          Pas de visite régulière
        </label>
      </div>
      {value.isNone ? (
        <p className="text-xs text-muted-foreground">Aucune visite n&apos;est planifiée d&apos;office : seuls les rendez-vous que vous ajoutez apparaissent.</p>
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Une visite {label.every.toLowerCase()}</span>
        <label htmlFor="person-every" className="sr-only">Tous les combien</label>
        <Input
          id="person-every"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_EVERY}
          value={value.typed}
          onChange={handleEveryChange}
          className="w-20"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? "person-every-error" : undefined}
        />
        <label htmlFor="person-period" className="sr-only">Unité</label>
        <select id="person-period" value={value.period} onChange={handlePeriodChange} className={`${SELECT_CLASS} w-36`}>
          {PERIODS.map((p) => (
            <option key={p} value={p}>{value.every === 1 ? PERIOD_LABELS[p].singular : PERIOD_LABELS[p].plural}</option>
          ))}
        </select>
      </div>
      )}
      {!value.isNone && value.kept && value.kept.visitPeriod !== null && (
        <p className="text-xs text-muted-foreground">
          Fréquence enregistrée : {value.kept.visitsPerPeriod} visites {PERIOD_LABELS[value.kept.visitPeriod].per}. Elle reste telle quelle tant que vous ne la changez pas.
        </p>
      )}
      {error && <p id="person-every-error" className={ERROR_TEXT}>{error}</p>}
    </fieldset>
  );
}

type LastVisitProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly max: string;
  readonly error?: string;
  readonly disabled: boolean;
};

/** « Dernière visite le »: the next one is counted from it (Thomas, 2026-11-02). */
export function LastVisitField({ value, onChange, max, error, disabled }: LastVisitProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }
  const describedBy = error ? "person-last-visit-hint person-last-visit-error" : "person-last-visit-hint";
  return (
    <div className="space-y-1">
      <Label htmlFor="person-last-visit">Dernière visite (facultatif)</Label>
      <p id="person-last-visit-hint" className="text-xs text-muted-foreground">
        La prochaine visite est calculée à partir de cette date. Vide : la première visite est prévue sans urgence.
      </p>
      <Input
        id="person-last-visit"
        type="date"
        value={value}
        max={max}
        onChange={handleChange}
        disabled={disabled}
        className="w-48"
        aria-invalid={error ? "true" : "false"}
        aria-describedby={describedBy}
      />
      {error && <p id="person-last-visit-error" className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}

type EhpadProps = {
  readonly address: Place | null;
  /** Null = not chosen: follows the address. */
  readonly choice: boolean | null;
  readonly onChange: (choice: boolean) => void;
  readonly disabled: boolean;
};

const HOURS = `${minutesToTime(EHPAD_VISIT_FROM).replace(":", " h ")} – ${minutesToTime(EHPAD_VISIT_TO).replace(":", " h ")}`;

/** « Réside en EHPAD »: ticked by itself when the address is a known EHPAD; can always be changed. */
export function EhpadField({ address, choice, onChange, disabled }: EhpadProps) {
  const found = address ? findEhpad(address.label, address) : null;
  const isAuto = found !== null || (address !== null && mentionsEhpad(address.label));
  const checked = choice ?? isAuto;
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.checked);
  }
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={handleChange} disabled={disabled} className="mt-0.5 h-4 w-4 accent-primary" aria-describedby="person-ehpad-hint" />
        <span className="font-medium">Réside en EHPAD</span>
      </label>
      <p id="person-ehpad-hint" className="pl-6 text-xs text-muted-foreground">
        {found && choice === null && <>Reconnu d&apos;après l&apos;adresse : {found.name}. </>}
        Visites l&apos;après-midi seulement ({HOURS}), regroupées avec les autres résidents.
      </p>
    </div>
  );
}
