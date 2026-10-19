"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppointmentInput } from "@/lib/agenda/appointments";
import { formatDuration } from "@/lib/agenda/rules";
import type { PriorityValue } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { localToday, PRIORITY_LABELS } from "./format";
import {
  checkValues,
  DURATIONS,
  SELECT_CLASS,
  FIELD_ORDER,
  initialValues,
  PLACE_CHOICES,
  toInput,
  weekOptions,
  WHEN_CHOICES,
} from "./form-model";
import type { FieldErrors, FieldKey, FieldProps, FormValues } from "./form-model";
import type { PersonOption } from "./shared-contracts";
import { WhenFields } from "./when-fields";

type AppointmentFormProps = {
  readonly persons: readonly PersonOption[];
  readonly defaultParticipantIds: readonly string[];
  readonly isBusy: boolean;
  readonly onSubmit: (input: AppointmentInput) => void;
  readonly onCancel: () => void;
  /** Server error, shown above the buttons. */
  readonly children?: ReactNode;
};

/** Step 1 of « Nouveau rendez-vous »: what, with whom, where, how long, when, how important. */
export function AppointmentForm({ persons, defaultParticipantIds, isBusy, onSubmit, onCancel, children }: AppointmentFormProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(localToday(), defaultParticipantIds));
  const [errors, setErrors] = useState<FieldErrors>({});
  const fields = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});

  function update(patch: Partial<FormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function register(key: FieldKey) {
    return function setField(element: HTMLInputElement | null) {
      fields.current[key] = element;
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = checkValues(values);
    setErrors(found);
    const first = FIELD_ORDER.find((key) => found[key] !== undefined);
    if (first) {
      fields.current[first]?.focus();
      return;
    }
    onSubmit(toInput(values));
  }

  const props: FieldProps = { values, update, errors, register };
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <fieldset disabled={isBusy} className="space-y-5">
        <TitleField {...props} />
        <ParticipantsField {...props} persons={persons} />
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <PlaceField {...props} />
          <DurationField {...props} />
        </div>
        <WhenFields {...props} weeks={weekOptions(localToday())} choices={WHEN_CHOICES} />
        <PriorityField {...props} />
      </fieldset>
      {children}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>Annuler</Button>
        <Button type="submit" disabled={isBusy}>
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Ajouter le rendez-vous
        </Button>
      </DialogFooter>
    </form>
  );
}

function TitleField({ values, update, errors, register }: FieldProps) {
  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    update({ title: event.target.value });
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="appt-title">Objet <span className="font-normal text-muted-foreground">(obligatoire)</span></Label>
      <Input
        ref={register("title")}
        id="appt-title"
        value={values.title}
        onChange={handleTitleChange}
        placeholder="ex. Audience chez le juge, rendez-vous à la banque…"
        autoComplete="off"
        maxLength={200}
        aria-required="true"
        aria-invalid={errors.title ? "true" : "false"}
        aria-describedby={errors.title ? "appt-title-error" : undefined}
      />
      {errors.title && <p id="appt-title-error" className={ERROR_TEXT}>{errors.title}</p>}
    </div>
  );
}

function ParticipantsField({ values, update, persons }: FieldProps & { readonly persons: readonly PersonOption[] }) {
  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    const id = event.target.value;
    const others = values.participantIds.filter((p) => p !== id);
    update({ participantIds: event.target.checked ? [...others, id] : others });
  }
  return (
    <fieldset className="space-y-2" aria-describedby="appt-people-hint">
      <legend className="text-sm font-medium">Avec qui ? <span className="font-normal text-muted-foreground">(facultatif)</span></legend>
      <p id="appt-people-hint" className="text-xs text-muted-foreground">
        Sans personne cochée, c&apos;est un rendez-vous personnel.
        {values.participantIds.length > 0 && ` ${values.participantIds.length} personne${values.participantIds.length > 1 ? "s" : ""} choisie${values.participantIds.length > 1 ? "s" : ""}.`}
      </p>
      {persons.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune personne dans l&apos;agenda pour l&apos;instant.</p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
          {persons.map((person) => (
            <li key={person.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60">
                <input type="checkbox" value={person.id} checked={values.participantIds.includes(person.id)} onChange={handleToggle} className="h-4 w-4 accent-primary" />
                {person.fullName}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function PlaceField({ values, update }: FieldProps) {
  function handlePlaceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const choice = PLACE_CHOICES.find((c) => c.value === event.target.value);
    if (choice) update({ place: choice.value });
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Où ?</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {PLACE_CHOICES.map((choice) => (
          <label key={choice.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="appt-place" value={choice.value} checked={values.place === choice.value} onChange={handlePlaceChange} className="h-4 w-4 accent-primary" />
            {choice.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DurationField({ values, update }: FieldProps) {
  function handleDurationChange(event: React.ChangeEvent<HTMLSelectElement>) {
    update({ durationMin: Number(event.target.value) });
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="appt-duration">Durée</Label>
      <select id="appt-duration" value={values.durationMin} onChange={handleDurationChange} className={`${SELECT_CLASS} w-36`}>
        {DURATIONS.map((m) => (
          <option key={m} value={m}>{formatDuration(m)}</option>
        ))}
      </select>
    </div>
  );
}

const PRIORITIES: readonly PriorityValue[] = ["LOW", "NORMAL", "HIGH", "MUST"];

function PriorityField({ values, update }: FieldProps) {
  function handlePriorityChange(event: React.ChangeEvent<HTMLInputElement>) {
    const choice = PRIORITIES.find((p) => p === event.target.value);
    if (choice) update({ priority: choice });
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Priorité</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PRIORITIES.map((p) => (
          <label key={p} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted/50">
            <input type="radio" name="appt-priority" value={p} checked={values.priority === p} onChange={handlePriorityChange} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="font-medium">{PRIORITY_LABELS[p].label}</span>
              <span className="block text-xs text-muted-foreground">{PRIORITY_LABELS[p].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
