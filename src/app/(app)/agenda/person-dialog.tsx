"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  END_REASON_LABELS,
  formatDuration,
  type AgendaEndReasonValue,
} from "@/lib/agenda/rules";
import type { AgendaPersonView, Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT, PENDING_ADDRESS_ERROR } from "./address-field";
import { saveAgendaPerson } from "./actions";
import { DurationField } from "./duration-field";
import { EhpadField, FrequencyField, LastVisitField, frequencyPayload, initialFrequency, type Frequency } from "./person-visit-fields";
import { useAgendaAction } from "./use-agenda-action";

type Status = AgendaPersonView["status"];

const SELECT_CLASS =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_CHOICES: { value: Status; label: string; hint: string }[] = [
  { value: "ACTIVE", label: "À visiter", hint: "Les visites sont planifiées selon la fréquence." },
  { value: "PAUSED", label: "En pause", hint: "Hospitalisation, séjour… aucune visite planifiée pour l'instant." },
  { value: "ENDED", label: "Mesure terminée", hint: "Plus aucune visite ne sera planifiée." },
];

/** Today on this computer, "YYYY-MM-DD" (the max of « Dernière visite »). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = new person. */
  person: AgendaPersonView | null;
  defaultVisitMinutes: number;
};

export function PersonDialog({ open, onOpenChange, person, defaultVisitMinutes }: Props) {
  const [fullName, setFullName] = useState(person?.fullName ?? "");
  const [address, setAddress] = useState<Place | null>(person?.address ?? null);
  const [frequency, setFrequency] = useState<Frequency>(() => initialFrequency(person));
  const [lastVisitOn, setLastVisitOn] = useState(person?.lastVisitOn ?? "");
  const [inEhpad, setInEhpad] = useState<boolean | null>(person?.inEhpad ?? null);
  const [visitMinutes, setVisitMinutes] = useState<number | null>(person?.visitMinutes ?? null);
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [status, setStatus] = useState<Status>(person?.status ?? "ACTIVE");
  const [endReason, setEndReason] = useState<AgendaEndReasonValue | null>(person?.endReason ?? null);
  const [isAddressPending, setIsAddressPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; reason?: string; address?: string; frequency?: string; lastVisit?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const { run, isBusy, error } = useAgendaAction();

  function handleAddressPending(isPending: boolean) {
    setIsAddressPending(isPending);
    if (!isPending) setFieldErrors((errors) => ({ ...errors, address: undefined }));
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFullName(event.target.value);
  }

  function handlePhoneChange(event: React.ChangeEvent<HTMLInputElement>) {
    setPhone(event.target.value);
  }


  function handleNotesChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setNotes(event.target.value);
  }

  function handleStatusChange(event: React.ChangeEvent<HTMLInputElement>) {
    setStatus(event.target.value as Status); // radio values are STATUS_CHOICES
  }

  function handleEndReasonChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setEndReason(event.target.value === "" ? null : (event.target.value as AgendaEndReasonValue)); // options are END_REASON_LABELS keys
  }

  /** Field-level checks (same rules as the server), focusing the first problem. */
  function checkFields(): boolean {
    const errors: typeof fieldErrors = {};
    if (fullName.trim().length < 2) errors.name = "Indiquez le nom de la personne.";
    if (isAddressPending) errors.address = PENDING_ADDRESS_ERROR;
    if (!frequency.isNone && frequency.every === null) errors.frequency = "Indiquez tous les combien (un nombre entre 1 et 52).";
    if (lastVisitOn !== "" && lastVisitOn > todayIso()) errors.lastVisit = "La dernière visite ne peut pas être dans le futur.";
    if (status === "ENDED" && endReason === null) errors.reason = "Indiquez la raison de la fin de mesure.";
    setFieldErrors(errors);
    if (errors.name) nameRef.current?.focus();
    else if (errors.reason) reasonRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkFields()) return;
    const payload = {
      fullName,
      address,
      ...frequencyPayload(frequency),
      lastVisitOn: lastVisitOn === "" ? null : lastVisitOn,
      inEhpad,
      visitMinutes,
      notes: notes.trim() || null,
      phone: phone.trim() || null,
      status,
      endReason: status === "ENDED" ? endReason : null,
    };
    if (await run(() => saveAgendaPerson(person?.id ?? null, payload))) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{person ? person.fullName : "Ajouter une personne à visiter"}</DialogTitle>
          <DialogDescription>
            Adresse du lieu de visite, et fréquence à laquelle vous souhaitez voir la personne.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="person-name">Nom <span className="text-muted-foreground font-normal">(obligatoire)</span></Label>
            <Input
              ref={nameRef}
              id="person-name"
              value={fullName}
              onChange={handleNameChange}
              disabled={isBusy}
              autoComplete="off"
              aria-required="true"
              aria-invalid={fieldErrors.name ? "true" : "false"}
              aria-describedby={fieldErrors.name ? "person-name-error" : undefined}
            />
            {fieldErrors.name && <p id="person-name-error" className={ERROR_TEXT}>{fieldErrors.name}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="person-phone">Téléphone (facultatif)</Label>
            <Input
              id="person-phone"
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              disabled={isBusy}
              autoComplete="off"
              inputMode="tel"
              className="w-56"
            />
          </div>

          <AddressField
            label="Lieu de visite"
            hint="Domicile, EHPAD, foyer… là où vous rencontrez la personne."
            value={address}
            onChange={setAddress}
            onPendingChange={handleAddressPending}
            disabled={isBusy}
          />
          {fieldErrors.address && <p role="alert" className={ERROR_TEXT}>{fieldErrors.address}</p>}

          <EhpadField address={address} choice={inEhpad} onChange={setInEhpad} disabled={isBusy} />

          <FrequencyField value={frequency} onChange={setFrequency} error={fieldErrors.frequency} disabled={isBusy} />

          <LastVisitField value={lastVisitOn} onChange={setLastVisitOn} max={todayIso()} error={fieldErrors.lastVisit} disabled={isBusy} />

          <DurationField
            id="person-minutes"
            label="Durée d'une visite"
            value={visitMinutes}
            onChange={setVisitMinutes}
            defaultLabel={`Par défaut (${formatDuration(defaultVisitMinutes)})`}
            disabled={isBusy}
            min={15}
          />

          <div className="space-y-1">
            <Label htmlFor="person-notes">Contraintes pratiques (facultatif)</Label>
            <p id="person-notes-hint" className="text-xs text-muted-foreground">
              Uniquement l&apos;organisation de la visite. N&apos;y notez pas d&apos;informations médicales.
            </p>
            <Textarea
              id="person-notes"
              value={notes}
              onChange={handleNotesChange}
              disabled={isBusy}
              placeholder="ex. pas avant 10 h, appeler la veille, digicode…"
              rows={2}
              aria-describedby="person-notes-hint"
            />
          </div>

          <fieldset className="space-y-2" disabled={isBusy}>
            <legend className="text-sm font-medium">Situation</legend>
            {STATUS_CHOICES.map((choice) => (
              <label key={choice.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="person-status"
                  value={choice.value}
                  checked={status === choice.value}
                  onChange={handleStatusChange}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{choice.label}</span>
                  <span className="block text-muted-foreground">{choice.hint}</span>
                </span>
              </label>
            ))}
            {status === "ENDED" && (
              <div className="space-y-1 pl-6">
                <Label htmlFor="person-end-reason">Raison <span className="text-muted-foreground font-normal">(obligatoire)</span></Label>
                <select
                  ref={reasonRef}
                  id="person-end-reason"
                  value={endReason ?? ""}
                  onChange={handleEndReasonChange}
                  className={`${SELECT_CLASS} w-72`}
                  aria-required="true"
                  aria-invalid={fieldErrors.reason ? "true" : "false"}
                  aria-describedby={fieldErrors.reason ? "person-end-reason-error" : undefined}
                >
                  <option value="">Choisir…</option>
                  {(Object.keys(END_REASON_LABELS) as AgendaEndReasonValue[]).map((r) => (
                    <option key={r} value={r}>{END_REASON_LABELS[r]}</option>
                  ))}
                </select>
                {fieldErrors.reason && <p id="person-end-reason-error" className={ERROR_TEXT}>{fieldErrors.reason}</p>}
                {person?.fromDossiers && (
                  <p className="text-sm text-muted-foreground">
                    Les dossiers APA/ASH/PCH ne sont pas modifiés : pour les clôturer, utilisez
                    l&apos;envoi du dernier email depuis le dossier.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Annuler
            </Button>
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
