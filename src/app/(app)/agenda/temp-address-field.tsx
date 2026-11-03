"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT } from "./address-field";

/** While being filled in: the address may not be chosen yet. Null = no temporary address. */
export type TempAddressDraft = { readonly address: Place | null; readonly from: string; readonly to: string } | null;

/** What is missing, or null when the draft can be saved. */
export function tempAddressProblem(draft: TempAddressDraft): string | null {
  if (draft === null) return null;
  if (draft.address === null) return "Choisissez l'adresse temporaire dans la liste.";
  if (draft.from === "" || draft.to === "") return "Indiquez du combien au combien vaut l'adresse temporaire.";
  if (draft.to < draft.from) return "La fin de l'adresse temporaire doit suivre son début.";
  return null;
}

type Props = {
  readonly value: TempAddressDraft;
  readonly onChange: (value: TempAddressDraft) => void;
  readonly onPendingChange: (isPending: boolean) => void;
  readonly today: string;
  readonly error?: string;
  readonly disabled?: boolean;
};

/**
 * « Adresse temporaire » (Thomas, 2026-11-03): an EHPAD after a hospital stay,
 * the hospital itself… Visits due between these days go there; the usual
 * address is never changed, and comes back on its own after the end date.
 */
export function TempAddressField({ value, onChange, onPendingChange, today, error, disabled }: Props) {
  const id = useId();
  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.checked ? { address: null, from: today, to: "" } : null);
    if (!event.target.checked) onPendingChange(false);
  }
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Adresse temporaire</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value !== null} onChange={handleToggle} className="h-4 w-4 accent-primary" />
        Adresse temporaire <span className="text-muted-foreground">(EHPAD après une hospitalisation, hôpital…)</span>
      </label>
      {value !== null && (
        <div className="space-y-3 rounded-md border p-3">
          <AddressField
            label="Où, pendant ce temps"
            hint="Le nom de l'établissement suffit (« Centre hospitalier Tulle »)."
            value={value.address}
            onChange={(address) => onChange({ ...value, address })}
            onPendingChange={onPendingChange}
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${id}-from`}>Du</Label>
              <Input id={`${id}-from`} type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-to`}>Au (inclus)</Label>
              <Input id={`${id}-to`} type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} className="w-44" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Les visites continuent d&apos;être proposées, à cette adresse. Après la date de fin, c&apos;est de nouveau le lieu de visite habituel.</p>
        </div>
      )}
      {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
    </fieldset>
  );
}
