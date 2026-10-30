"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DayRuleView } from "@/lib/agenda/day-rules";
import { minutesToTime, timeToMinutes } from "@/lib/agenda/rules";
import { ERROR_TEXT } from "./address-field";
import { saveAgendaDayRule } from "./actions";
import { useAgendaAction } from "./use-agenda-action";

type Strength = Extract<DayRuleView, { type: "UNAVAILABLE" }>["strength"];
export type RuleKind = DayRuleView["type"];

const SELECT_CLASS =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export const STRENGTH_CHOICES: { value: Strength; label: string; hint: string }[] = [
  { value: "HARD", label: "Impératif", hint: "Jamais de rendez-vous proposé." },
  { value: "STRONG", label: "Important", hint: "Tutellia vous demande avant de proposer un rendez-vous." },
  { value: "MEDIUM", label: "Souhaité", hint: "Évité autant que possible." },
  { value: "SOFT", label: "Si possible", hint: "Une simple préférence." },
];

type Draft = {
  label: string;
  strength: Strength;
  dow: number;
  allDay: boolean;
  from: string;
  to: string;
  atOffice: boolean;
  dateFrom: string;
  dateTo: string;
};

function draftOf(rule: DayRuleView | null): Draft {
  const base: Draft = { label: "", strength: "HARD", dow: 1, allDay: true, from: "14:00", to: "18:00", atOffice: false, dateFrom: "", dateTo: "" };
  if (rule === null) return base;
  if (rule.type === "VACATION") return { ...base, label: rule.label, dateFrom: rule.from, dateTo: rule.to };
  return {
    ...base,
    label: rule.label,
    strength: rule.strength,
    dow: rule.dow,
    allDay: rule.allDay,
    from: rule.fromMin === null ? base.from : minutesToTime(rule.fromMin),
    to: rule.toMin === null ? base.to : minutesToTime(rule.toMin),
    atOffice: rule.atOffice,
  };
}

function payloadOf(kind: RuleKind, d: Draft) {
  if (kind === "VACATION") return { type: kind, label: d.label, from: d.dateFrom, to: d.dateTo };
  const fromMin = d.allDay ? null : timeToMinutes(d.from);
  const toMin = d.allDay ? null : timeToMinutes(d.to);
  return { type: kind, label: d.label, strength: d.strength, dow: d.dow, allDay: d.allDay, fromMin, toMin, atOffice: d.atOffice };
}

/** Same rules as the server, checked first so the message appears at once. */
function checkDraft(kind: RuleKind, d: Draft): string | null {
  if (d.label.trim() === "") return "Donnez un nom à ce créneau.";
  if (kind === "VACATION") {
    if (d.dateFrom === "" || d.dateTo === "") return "Indiquez la date de début et la date de fin.";
    return d.dateFrom > d.dateTo ? "La date de fin doit être après la date de début." : null;
  }
  if (d.allDay) return null;
  const from = timeToMinutes(d.from);
  const to = timeToMinutes(d.to);
  if (from === null || to === null) return "Indiquez des heures valides.";
  return from >= to ? "L'heure de fin doit être après l'heure de début." : null;
}

type Props = { kind: RuleKind; rule: DayRuleView | null; open: boolean; onOpenChange: (open: boolean) => void };

/** Adds or edits one unavailability (a weekday, all day or some hours) or one holiday. */
export function DayRuleDialog({ kind, rule, open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(rule));
  const [localError, setLocalError] = useState<string | null>(null);
  const { run, isBusy, error } = useAgendaAction();

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = checkDraft(kind, draft);
    setLocalError(problem);
    if (problem) return;
    if (await run(() => saveAgendaDayRule(rule?.id ?? null, payloadOf(kind, draft)))) onOpenChange(false);
  }

  const title = kind === "VACATION" ? (rule ? "Modifier les vacances" : "Ajouter des vacances") : rule ? "Modifier l'indisponibilité" : "Ajouter une indisponibilité";
  const message = localError ?? error;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "VACATION"
              ? "Aucun rendez-vous n'est proposé pendant vos vacances, du premier au dernier jour inclus."
              : "Un jour de la semaine, ou quelques heures, où vous ne voulez pas, ou préférez ne pas avoir de rendez-vous."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset disabled={isBusy} className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="rule-label">Nom</Label>
              <Input
                id="rule-label"
                value={draft.label}
                maxLength={80}
                placeholder={kind === "VACATION" ? "Vacances d'été" : "Mercredi après-midi : enfants"}
                onChange={(e) => update({ label: e.target.value })}
              />
            </div>
            {kind === "VACATION" ? <HolidayFields draft={draft} update={update} /> : <UnavailableFields draft={draft} update={update} />}
          </fieldset>
          {message && <p role="alert" className={ERROR_TEXT}>{message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Annuler</Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldsProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

function HolidayFields({ draft, update }: FieldsProps) {
  return (
    <div className="flex flex-wrap gap-6">
      <div className="space-y-1">
        <Label htmlFor="rule-date-from">Du</Label>
        <Input id="rule-date-from" type="date" value={draft.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} className="w-44" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rule-date-to">Au (inclus)</Label>
        <Input id="rule-date-to" type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => update({ dateTo: e.target.value })} className="w-44" />
      </div>
    </div>
  );
}

function UnavailableFields({ draft, update }: FieldsProps) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="rule-dow">Jour</Label>
        <select id="rule-dow" value={draft.dow} onChange={(e) => update({ dow: Number(e.target.value) })} className={`${SELECT_CLASS} w-44`}>
          {DAY_NAMES.map((name, i) => <option key={name} value={i + 1}>Chaque {name.toLowerCase()}</option>)}
        </select>
      </div>
      <HoursFields draft={draft} update={update} />
      <StrengthField draft={draft} update={update} />
      <div className="flex items-center gap-2">
        <Checkbox id="rule-office" checked={draft.atOffice} onCheckedChange={(v) => update({ atOffice: v === true })} />
        <Label htmlFor="rule-office" className="font-normal">Je suis au bureau pendant ce créneau</Label>
      </div>
    </>
  );
}

function HoursFields({ draft, update }: FieldsProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Quand</legend>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="rule-span" checked={draft.allDay} onChange={() => update({ allDay: true })} />
          Toute la journée
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="rule-span" checked={!draft.allDay} onChange={() => update({ allDay: false })} />
          De telle heure à telle heure
        </label>
      </div>
      {!draft.allDay && (
        <div className="flex flex-wrap gap-6 pt-1">
          <div className="space-y-1">
            <Label htmlFor="rule-from">De</Label>
            <Input id="rule-from" type="time" value={draft.from} onChange={(e) => update({ from: e.target.value })} className="w-32" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-to">À</Label>
            <Input id="rule-to" type="time" value={draft.to} onChange={(e) => update({ to: e.target.value })} className="w-32" />
          </div>
        </div>
      )}
    </fieldset>
  );
}

function StrengthField({ draft, update }: FieldsProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">À quel point</legend>
      {STRENGTH_CHOICES.map((choice) => (
        <label key={choice.value} className="flex items-start gap-2 text-sm">
          <input type="radio" name="rule-strength" className="mt-1" checked={draft.strength === choice.value} onChange={() => update({ strength: choice.value })} />
          <span>
            <span className="font-medium">{choice.label}</span>
            <span className="text-muted-foreground"> — {choice.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
