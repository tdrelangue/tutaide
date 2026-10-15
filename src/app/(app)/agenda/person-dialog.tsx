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
  PERIOD_LABELS,
  type AgendaEndReasonValue,
  type AgendaPeriodValue,
} from "@/lib/agenda/rules";
import type { AgendaPersonView, Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT, PENDING_ADDRESS_ERROR } from "./address-field";
import { saveAgendaPerson } from "./actions";
import { VISIT_DURATIONS } from "./settings-tab";
import { useAgendaAction } from "./use-agenda-action";

type Status = AgendaPersonView["status"];

const SELECT_CLASS =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_CHOICES: { value: Status; label: string; hint: string }[] = [
  { value: "ACTIVE", label: "À visiter", hint: "Les visites sont planifiées selon la fréquence." },
  { value: "PAUSED", label: "En pause", hint: "Hospitalisation, séjour… aucune visite planifiée pour l'instant." },
  { value: "ENDED", label: "Mesure terminée", hint: "Plus aucune visite ne sera planifiée." },
];

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
  const [visits, setVisits] = useState(person?.visitsPerPeriod ?? 1);
  const [period, setPeriod] = useState<AgendaPeriodValue>(person?.visitPeriod ?? "QUARTER");
  const [visitMinutes, setVisitMinutes] = useState<number | null>(person?.visitMinutes ?? null);
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [status, setStatus] = useState<Status>(person?.status ?? "ACTIVE");
  const [endReason, setEndReason] = useState<AgendaEndReasonValue | null>(person?.endReason ?? null);
  const [isAddressPending, setIsAddressPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; reason?: string; address?: string }>({});
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

  function handleVisitsChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setVisits(Number(event.target.value));
  }

  function handlePeriodChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setPeriod(event.target.value as AgendaPeriodValue); // options are the PERIOD_LABELS keys
  }

  function handleMinutesChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setVisitMinutes(event.target.value === "" ? null : Number(event.target.value));
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
      visitsPerPeriod: visits,
      visitPeriod: period,
      visitMinutes,
      notes: notes.trim() || null,
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

          <AddressField
            label="Lieu de visite"
            hint="Domicile, EHPAD, foyer… là où vous rencontrez la personne."
            value={address}
            onChange={setAddress}
            onPendingChange={handleAddressPending}
            disabled={isBusy}
          />
          {fieldErrors.address && <p role="alert" className={ERROR_TEXT}>{fieldErrors.address}</p>}

          <fieldset className="space-y-2" disabled={isBusy}>
            <legend className="text-sm font-medium">Fréquence des visites</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="person-visits" className="sr-only">Nombre de visites</label>
              <select id="person-visits" value={visits} onChange={handleVisitsChange} className={`${SELECT_CLASS} w-20`}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-sm">visite{visits > 1 ? "s" : ""} par</span>
              <label htmlFor="person-period" className="sr-only">Période</label>
              <select id="person-period" value={period} onChange={handlePeriodChange} className={`${SELECT_CLASS} w-36`}>
                {(Object.keys(PERIOD_LABELS) as AgendaPeriodValue[]).map((p) => (
                  <option key={p} value={p}>{PERIOD_LABELS[p].singular}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="person-minutes">Durée d&apos;une visite</Label>
            <select id="person-minutes" value={visitMinutes ?? ""} onChange={handleMinutesChange} disabled={isBusy} className={`${SELECT_CLASS} w-56`}>
              <option value="">Par défaut ({formatDuration(defaultVisitMinutes)})</option>
              {VISIT_DURATIONS.map((m) => (
                <option key={m} value={m}>{formatDuration(m)}</option>
              ))}
            </select>
          </div>

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
