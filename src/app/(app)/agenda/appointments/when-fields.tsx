"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IsoDate } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { SELECT_CLASS } from "./form-model";
import type { FieldKey, FieldProps, WhenKind } from "./form-model";

type WhenFieldsProps = FieldProps & {
  readonly weeks: readonly { value: IsoDate; label: string }[];
  readonly choices: readonly { value: WhenKind; label: string }[];
};

/** « Quand ? »: segmented choice (radio group), then the fields of that choice. */
export function WhenFields({ weeks, choices, ...props }: WhenFieldsProps) {
  const { values, update } = props;

  function handleKindChange(event: React.ChangeEvent<HTMLInputElement>) {
    const choice = choices.find((c) => c.value === event.target.value);
    if (choice) update({ whenKind: choice.value });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Quand ?</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {choices.map((choice) => (
          <label key={choice.value} className="cursor-pointer">
            <input type="radio" name="appt-when" value={choice.value} checked={values.whenKind === choice.value} onChange={handleKindChange} className="peer sr-only" />
            <span className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors peer-checked:bg-background peer-checked:font-medium peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {choice.label}
            </span>
          </label>
        ))}
      </div>
      {values.whenKind === "FIXED" && <FixedFields {...props} />}
      {values.whenKind === "WEEK" && <WeekField {...props} weeks={weeks} />}
      {values.whenKind === "RANGE" && <RangeFields {...props} />}
    </fieldset>
  );
}

type DateFieldProps = FieldProps & {
  readonly field: FieldKey;
  readonly label: string;
  readonly type: "date" | "time";
  readonly value: string;
  readonly onValue: (value: string) => void;
};

function DateField({ field, label, type, value, onValue, errors, register }: DateFieldProps) {
  const id = `appt-${field}`;
  const error = errors[field];
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onValue(event.target.value);
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={register(field)}
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        className="w-44"
        aria-required="true"
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}

function FixedFields(props: FieldProps) {
  const { values, update } = props;
  function handleDate(value: string) {
    update({ date: value });
  }
  function handleTime(value: string) {
    update({ time: value });
  }
  return (
    <div className="flex flex-wrap gap-4">
      <DateField {...props} field="date" label="Date" type="date" value={values.date} onValue={handleDate} />
      <DateField {...props} field="time" label="Heure" type="time" value={values.time} onValue={handleTime} />
    </div>
  );
}

function WeekField({ values, update, weeks }: FieldProps & { readonly weeks: WhenFieldsProps["weeks"] }) {
  function handleWeekChange(event: React.ChangeEvent<HTMLSelectElement>) {
    update({ weekOf: event.target.value });
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="appt-week">Semaine</Label>
      <p id="appt-week-hint" className="text-xs text-muted-foreground">Du lundi au vendredi : Tutellia choisit le meilleur moment.</p>
      <select id="appt-week" value={values.weekOf} onChange={handleWeekChange} aria-describedby="appt-week-hint" className={`${SELECT_CLASS} w-72`}>
        {weeks.map((week) => (
          <option key={week.value} value={week.value}>{week.label}</option>
        ))}
      </select>
    </div>
  );
}

function RangeFields(props: FieldProps) {
  const { values, update } = props;
  function handleFrom(value: string) {
    update({ from: value });
  }
  function handleTo(value: string) {
    update({ to: value });
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Tutellia choisit le meilleur moment entre ces deux dates (incluses).</p>
      <div className="flex flex-wrap gap-4">
        <DateField {...props} field="from" label="Entre le" type="date" value={values.from} onValue={handleFrom} />
        <DateField {...props} field="to" label="et le" type="date" value={values.to} onValue={handleTo} />
      </div>
    </div>
  );
}
