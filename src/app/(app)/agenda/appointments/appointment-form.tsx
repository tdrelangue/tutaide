"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppointmentInput } from "@/lib/agenda/appointments";
import type { PriorityValue } from "@/lib/agenda/views/types";
import type { Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT } from "../address-field";
import { DurationField as DurationSelect } from "../duration-field";
import { BusyButton } from "../week/busy-button";
import { localToday, PRIORITY_LABELS } from "./format";
import {
  checkValues,
  SELECT_CLASS,
  FIELD_ORDER,
  initialValues,
  PLACE_CHOICES,
  placeChoicesFor,
  placePartner,
  placePerson,
  toInput,
  weekOptions,
  WHEN_CHOICES,
} from "./form-model";
import type { FieldErrors, FieldKey, FieldProps, FormValues } from "./form-model";
import { isPartnerOption, type PersonOption } from "./shared-contracts";
import { ParticipantPicker } from "./participant-picker";
import { WhenFields } from "./when-fields";
import { QuickContactDialog } from "./quick-contact-dialog";
import type { QuickContact } from "../actions";

type AppointmentFormProps = {
  readonly persons: readonly PersonOption[];
  readonly defaultParticipantIds: readonly string[];
  readonly isBusy: boolean;
  readonly onSubmit: (input: AppointmentInput) => void;
  readonly onCancel: () => void;
  /** « Modifier le rendez-vous »: the stored values, and the button says « Enregistrer ». */
  readonly initial?: FormValues;
  readonly submitLabel?: string;
  /** Server error, shown above the buttons. */
  readonly children?: ReactNode;
};

/** Step 1 of « Nouveau rendez-vous »: what, with whom, where, how long, when, how important. */
export function AppointmentForm({ persons: known, defaultParticipantIds, isBusy, onSubmit, onCancel, initial, submitLabel = "Ajouter le rendez-vous", children }: AppointmentFormProps) {
  const [values, setValues] = useState<FormValues>(() => initial ?? initialValues(localToday(), defaultParticipantIds));
  /** Contacts added from « Avec qui ? » while filling the form (the page's list comes back with them later). */
  const [added, setAdded] = useState<readonly PersonOption[]>([]);
  const [newContactName, setNewContactName] = useState<string | null>(null);
  const persons = [...known, ...added.filter((a) => !known.some((k) => k.id === a.id))];
  function handleContactCreated(contact: QuickContact) {
    setAdded((current) => [...current, { id: contact.id, fullName: contact.fullName, kind: "PARTNER", group: contact.group, searchText: contact.fullName }]);
    setValues((current) => ({ ...current, partnerIds: [...current.partnerIds, contact.id] }));
  }
  function handleNewContactClose() {
    setNewContactName(null);
  }
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
        <PersonalField {...props} />
        {!values.personal && <ParticipantsField {...props} persons={persons} onCreate={setNewContactName} />}
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <PlaceField {...props} persons={persons} />
          <DurationField {...props} />
        </div>
        <WhenFields {...props} weeks={weekOptions(localToday())} choices={WHEN_CHOICES} />
        {/* A fixed date and time is already agreed: nothing to rank (Thomas, 2026-11-03). */}
        {values.whenKind !== "FIXED" && <PriorityField {...props} />}
      </fieldset>
      {children}
      <QuickContactDialog
        name={newContactName}
        address={values.place === "OUTSIDE" ? values.outsideAddress : null}
        onClose={handleNewContactClose}
        onCreated={handleContactCreated}
      />
      <DialogFooter className="gap-2">
        {/* Focusable while saving: a disabled button would drop focus to <body> (WCAG 2.4.3). */}
        <BusyButton type="button" variant="outline" onClick={onCancel} busy={isBusy}>Annuler</BusyButton>
        <BusyButton type="submit" busy={isBusy}>
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </BusyButton>
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

function PersonalField({ values, update }: FieldProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const personal = event.target.checked;
    // « Chez la personne / le contact » make no sense without anyone: back to the office.
    const place = personal && (values.place === "PERSON" || values.place === "PARTNER") ? "OFFICE" : values.place;
    update({ personal, place });
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={values.personal} onChange={handleChange} className="h-4 w-4 accent-primary" />
      Rendez-vous personnel <span className="text-muted-foreground">(médecin, famille… : sans personne suivie, dans sa propre couleur)</span>
    </label>
  );
}

function ParticipantsField({ values, update, persons, onCreate }: FieldProps & { readonly persons: readonly PersonOption[]; readonly onCreate: (name: string) => void }) {
  /** One search for persons and contacts; the form keeps them apart (they are stored differently). */
  function handleChange(ids: string[]) {
    const partners = new Set(persons.filter(isPartnerOption).map((p) => p.id));
    update({ participantIds: ids.filter((id) => !partners.has(id)), partnerIds: ids.filter((id) => partners.has(id)) });
  }
  const chosen = [...values.participantIds, ...values.partnerIds];
  const count = chosen.length;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Avec qui ? <span className="font-normal text-muted-foreground">(facultatif)</span></legend>
      <p id="appt-people-hint" className="text-xs text-muted-foreground">
        Tapez quelques lettres du nom : personnes suivies et contacts (avocat, notaire…). Sans personne choisie, c&apos;est un rendez-vous personnel.
        {count > 0 && ` ${count} personne${count > 1 ? "s" : ""} choisie${count > 1 ? "s" : ""}.`}
      </p>
      <ParticipantPicker persons={persons} value={chosen} onChange={handleChange} describedBy="appt-people-hint" onCreate={onCreate} />
    </fieldset>
  );
}

function PlaceField({ values, update, errors, register, persons }: FieldProps & { readonly persons: readonly PersonOption[] }) {
  function handlePlaceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const choice = PLACE_CHOICES.find((c) => c.value === event.target.value);
    if (choice) update({ place: choice.value });
  }
  return (
    <fieldset className="space-y-2" aria-describedby={errors.place ? "appt-place-error" : undefined}>
      <legend className="text-sm font-medium">Où ?</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {placeChoicesFor(values).map((choice, i) => (
          <label key={choice.value} className="flex items-center gap-2 text-sm">
            <input
              ref={i === 0 ? register("place") : undefined}
              type="radio"
              name="appt-place"
              value={choice.value}
              checked={values.place === choice.value}
              onChange={handlePlaceChange}
              className="h-4 w-4 accent-primary"
            />
            {choice.label}
          </label>
        ))}
      </div>
      {values.place === "PERSON" && <PersonPlace values={values} update={update} persons={persons} />}
      {values.place === "PARTNER" && <PartnerPlace values={values} update={update} persons={persons} />}
      {values.place === "OUTSIDE" && <OutsidePlace values={values} update={update} />}
      {errors.place && <p id="appt-place-error" className={ERROR_TEXT}>{errors.place}</p>}
    </fieldset>
  );
}

type PlacePartProps = Pick<FieldProps, "values" | "update">;

/** Which participant receives: only asked when several are ticked. */
function PersonPlace({ values, update, persons }: PlacePartProps & { readonly persons: readonly PersonOption[] }) {
  const ticked = persons.filter((p) => !isPartnerOption(p) && values.participantIds.includes(p.id));
  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    update({ placePersonId: event.target.value });
  }
  if (ticked.length === 0) return <p className="text-xs text-muted-foreground">Choisissez la personne dans « Avec qui ? » : son adresse sera le lieu.</p>;
  if (ticked.length === 1) return <p className="text-xs text-muted-foreground">À l&apos;adresse de {ticked[0]?.fullName}.</p>;
  return (
    <div className="space-y-1">
      <Label htmlFor="appt-place-person">Chez qui ?</Label>
      <select id="appt-place-person" value={placePerson(values) ?? ""} onChange={handleChange} className={`${SELECT_CLASS} w-64`}>
        {ticked.map((p) => (
          <option key={p.id} value={p.id}>{p.fullName}</option>
        ))}
      </select>
    </div>
  );
}

/** « Au cabinet d'un contact »: which contact, when several are chosen. */
function PartnerPlace({ values, update, persons }: PlacePartProps & { readonly persons: readonly PersonOption[] }) {
  const chosen = persons.filter((p) => isPartnerOption(p) && values.partnerIds.includes(p.id));
  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    update({ placePartnerId: event.target.value });
  }
  if (chosen.length === 0) return <p className="text-xs text-muted-foreground">Choisissez le contact dans « Avec qui ? » : l&apos;adresse de sa fiche sera le lieu.</p>;
  if (chosen.length === 1) return <p className="text-xs text-muted-foreground">À l&apos;adresse de {chosen[0]?.fullName}.</p>;
  return (
    <div className="space-y-1">
      <Label htmlFor="appt-place-partner">Chez quel contact ?</Label>
      <select id="appt-place-partner" value={placePartner(values) ?? ""} onChange={handleChange} className={`${SELECT_CLASS} w-64`}>
        {chosen.map((p) => (
          <option key={p.id} value={p.id}>{p.fullName}</option>
        ))}
      </select>
    </div>
  );
}

/** « À l'extérieur »: what the place is, and its address (found by the geocoder). */
function OutsidePlace({ values, update }: PlacePartProps) {
  function handleLabelChange(event: React.ChangeEvent<HTMLInputElement>) {
    update({ outsideLabel: event.target.value });
  }
  function handleAddressChange(place: Place | null) {
    update({ outsideAddress: place });
  }
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label htmlFor="appt-outside-label">Lieu <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
        <Input id="appt-outside-label" value={values.outsideLabel} onChange={handleLabelChange} placeholder="ex. Étude du notaire, tribunal, banque…" maxLength={120} autoComplete="off" />
      </div>
      <AddressField label="Adresse" value={values.outsideAddress} onChange={handleAddressChange} />
    </div>
  );
}

function DurationField({ values, update }: FieldProps) {
  function handleDurationChange(minutes: number | null) {
    if (minutes !== null) update({ durationMin: minutes });
  }
  return <DurationSelect id="appt-duration" label="Durée" value={values.durationMin} onChange={handleDurationChange} choices={[15, 30, 45, 60, 90, 120, 180]} />;
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
