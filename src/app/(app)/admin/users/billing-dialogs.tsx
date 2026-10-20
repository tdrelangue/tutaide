"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { seatsLabel } from "@/lib/organizations/billing-plan";
import { InlineError, useStructureAction } from "../../structure/use-structure-action";
import type { OrgListItem } from "../organisations/actions";
import { saveBillingOffer, setBillingOfferArchived, setOrganizationBilling, type BillingOfferItem } from "../organisations/billing-actions";
import { centsToEuros, eurosToCents, toDateInput } from "./billing-required-field";

/** "2 400 € / an" */
export function yearlyLabel(cents: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(cents / 100)} € / an`;
}

/** "" = no limit; else a whole number ≥ 1. Undefined when invalid. */
function parseSeats(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : undefined;
}

function SubmitButton({ isBusy, label }: { isBusy: boolean; label: string }) {
  return (
    <Button type="submit" disabled={isBusy}>
      {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Offres types (catalogue)
// ---------------------------------------------------------------------------

type OfferDraft = { id?: string; name: string; amount: string; seats: string };
const EMPTY_DRAFT: OfferDraft = { name: "", amount: "", seats: "" };

function OfferForm({ draft, onDone }: { draft: OfferDraft; onDone: () => void }) {
  const { run, isBusy, error } = useStructureAction();
  // Keyed by the caller: a new draft (edit another offer, or reset) remounts the form.
  const [value, setValue] = useState(draft);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cents = eurosToCents(value.amount);
    const seats = parseSeats(value.seats);
    if (cents === null) return setLocalError("Prix annuel invalide (ex. 2400)");
    if (seats === undefined) return setLocalError("Nombre de comptes : un nombre entier, ou vide pour illimité");
    setLocalError(null);
    const ok = await run(() => saveBillingOffer({ id: value.id, name: value.name, yearlyAmountEuros: cents / 100, maxSeats: seats }));
    if (ok) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3" aria-label={value.id ? "Modifier l'offre" : "Nouvelle offre"}>
      <p className="text-sm font-medium">{value.id ? "Modifier l'offre" : "Nouvelle offre"}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-3">
          <Label htmlFor="offer-name">Nom</Label>
          <Input id="offer-name" value={value.name} placeholder="ex. Structure 10 comptes" onChange={(e) => setValue({ ...value, name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="offer-amount">Prix annuel (€)</Label>
          <Input id="offer-amount" inputMode="decimal" value={value.amount} placeholder="ex. 2400" onChange={(e) => setValue({ ...value, amount: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="offer-seats">Comptes maximum</Label>
          <Input id="offer-seats" inputMode="numeric" value={value.seats} placeholder="vide = illimité" aria-describedby="offer-seats-hint" onChange={(e) => setValue({ ...value, seats: e.target.value })} />
          <p id="offer-seats-hint" className="text-xs text-muted-foreground">Comptes actifs de la structure, administrateur compris.</p>
        </div>
      </div>
      <InlineError message={localError ?? error} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton isBusy={isBusy} label={value.id ? "Enregistrer" : "Créer l'offre"} />
        {value.id && <Button type="button" variant="outline" onClick={onDone} disabled={isBusy}>Annuler</Button>}
      </div>
    </form>
  );
}

function OfferLine({ offer, onEdit }: { offer: BillingOfferItem; onEdit: (offer: BillingOfferItem) => void }) {
  const { run, isBusy } = useStructureAction();
  function handleArchive() {
    if (!isBusy) void run(() => setBillingOfferArchived(offer.id, !offer.archived));
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {offer.name}
          {offer.archived && <Badge variant="outline" className="text-xs">Retirée du catalogue</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {yearlyLabel(offer.yearlyAmountCents)} · {seatsLabel(offer.maxSeats)} · {offer.orgCount} structure{offer.orgCount > 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(offer)} aria-label={`Modifier l'offre ${offer.name}`}>Modifier</Button>
        <Button type="button" size="sm" variant="ghost" aria-disabled={isBusy} onClick={handleArchive} aria-label={`${offer.archived ? "Remettre au catalogue" : "Retirer du catalogue"} : ${offer.name}`}>
          {offer.archived ? "Remettre au catalogue" : "Retirer"}
        </Button>
      </div>
    </li>
  );
}

export function OffersDialog({ open, offers, onClose }: { open: boolean; offers: readonly BillingOfferItem[]; onClose: () => void }) {
  const [draft, setDraft] = useState<OfferDraft>(EMPTY_DRAFT);
  const [formKey, setFormKey] = useState(0);
  function handleEdit(offer: BillingOfferItem) {
    setDraft({ id: offer.id, name: offer.name, amount: centsToEuros(offer.yearlyAmountCents), seats: offer.maxSeats === null ? "" : String(offer.maxSeats) });
    setFormKey((k) => k + 1);
  }
  function handleDone() {
    setDraft(EMPTY_DRAFT);
    setFormKey((k) => k + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Offres types</DialogTitle>
          <DialogDescription>
            Les formules proposées aux structures : un prix annuel pour un nombre de comptes. Pour un
            accord négocié, indiquez plutôt un prix spécifique dans l&apos;abonnement de la structure.
          </DialogDescription>
        </DialogHeader>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune offre pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">{offers.map((o) => <OfferLine key={o.id} offer={o} onEdit={handleEdit} />)}</ul>
        )}
        <OfferForm key={formKey} draft={draft} onDone={handleDone} />
        <p className="text-xs text-muted-foreground">
          Modifier une offre change le prix des prochains abonnements, pas celui d&apos;un abonnement déjà
          en cours.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Abonnement d'une structure
// ---------------------------------------------------------------------------

type OrgDraft = { required: boolean; mode: "offer" | "custom"; offerId: string; amount: string; seats: string; start: string };

function draftOf(org: OrgListItem): OrgDraft {
  const b = org.billing;
  return {
    required: b.required,
    mode: b.offerId !== null || b.customAmountCents === null ? "offer" : "custom",
    offerId: b.offerId ?? "",
    amount: centsToEuros(b.customAmountCents),
    seats: b.customMaxSeats === null ? "" : String(b.customMaxSeats),
    start: toDateInput(b.startsAt),
  };
}

function OfferChoice({ draft, offers, onChange }: { draft: OrgDraft; offers: readonly BillingOfferItem[]; onChange: (d: OrgDraft) => void }) {
  const choosable = offers.filter((o) => !o.archived || o.id === draft.offerId);
  if (choosable.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune offre type : créez-en avec le bouton « Offres types », ou choisissez un prix spécifique.</p>;
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="org-offer">Offre</Label>
      <Select value={draft.offerId} onValueChange={(v) => onChange({ ...draft, offerId: v })}>
        <SelectTrigger id="org-offer"><SelectValue placeholder="Choisir une offre" /></SelectTrigger>
        <SelectContent>
          {choosable.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name} · {yearlyLabel(o.yearlyAmountCents)} · {seatsLabel(o.maxSeats)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CustomChoice({ draft, onChange }: { draft: OrgDraft; onChange: (d: OrgDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="org-amount">Prix annuel (€)</Label>
        <Input id="org-amount" inputMode="decimal" value={draft.amount} placeholder="ex. 1800" onChange={(e) => onChange({ ...draft, amount: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="org-seats">Comptes maximum</Label>
        <Input id="org-seats" inputMode="numeric" value={draft.seats} placeholder="vide = illimité" onChange={(e) => onChange({ ...draft, seats: e.target.value })} />
      </div>
    </div>
  );
}

function PlanFields({ draft, offers, onChange }: { draft: OrgDraft; offers: readonly BillingOfferItem[]; onChange: (d: OrgDraft) => void }) {
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Formule</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="org-mode" value="offer" checked={draft.mode === "offer"} onChange={() => onChange({ ...draft, mode: "offer" })} />
        Offre type
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="org-mode" value="custom" checked={draft.mode === "custom"} onChange={() => onChange({ ...draft, mode: "custom" })} />
        Prix spécifique (accord négocié)
      </label>
      {draft.mode === "offer" ? <OfferChoice draft={draft} offers={offers} onChange={onChange} /> : <CustomChoice draft={draft} onChange={onChange} />}
      <div className="space-y-1">
        <Label htmlFor="org-start">Premier prélèvement le (facultatif)</Label>
        <Input id="org-start" type="date" value={draft.start} className="max-w-48" aria-describedby="org-start-hint" onChange={(e) => onChange({ ...draft, start: e.target.value })} />
        <p id="org-start-hint" className="text-xs text-muted-foreground">
          Pour une structure qui a déjà payé sa période en cours : accès complet jusqu&apos;à cette date, puis
          premier prélèvement (ou première facture). Vide : paiement dès la mise en place.
        </p>
      </div>
    </fieldset>
  );
}

/** Client-side checks; the server checks again. Returns the payload or an error message. */
function toInput(draft: OrgDraft) {
  const cents = draft.mode === "custom" && draft.amount.trim() !== "" ? eurosToCents(draft.amount) : null;
  const seats = draft.mode === "custom" ? parseSeats(draft.seats) : null;
  if (draft.mode === "custom" && draft.amount.trim() !== "" && cents === null) return "Prix annuel invalide (ex. 1800)";
  if (seats === undefined) return "Comptes maximum : un nombre entier, ou vide pour illimité";
  return {
    billingRequired: draft.required,
    mode: draft.mode,
    offerId: draft.mode === "offer" && draft.offerId ? draft.offerId : null,
    customAmountEuros: cents === null ? null : cents / 100,
    customMaxSeats: seats,
    startsAt: draft.start || null,
  };
}

export function OrgBillingDialog({ org, offers, onClose }: { org: OrgListItem | null; offers: readonly BillingOfferItem[]; onClose: () => void }) {
  return (
    <Dialog open={org !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abonnement de {org?.name}</DialogTitle>
          <DialogDescription>
            Un seul abonnement pour toute la structure, réglé par son administrateur, par carte ou sur
            facture (virement).
          </DialogDescription>
        </DialogHeader>
        {org && <OrgBillingForm key={org.id} org={org} offers={offers} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RequiredSwitch({ draft, onChange }: { draft: OrgDraft; onChange: (d: OrgDraft) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox id="org-required" checked={draft.required} onCheckedChange={(v) => onChange({ ...draft, required: v === true })} aria-describedby="org-required-hint" className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="org-required">Structure payante</Label>
        <p id="org-required-hint" className="text-sm text-muted-foreground">
          {draft.required
            ? "Sans abonnement réglé, les comptes de la structure sont bloqués après le délai de 30 jours."
            : "Structure offerte : aucun paiement demandé, et pas de limite de comptes."}
        </p>
      </div>
    </div>
  );
}

function OrgBillingForm({ org, offers, onClose }: { org: OrgListItem; offers: readonly BillingOfferItem[]; onClose: () => void }) {
  const { run, isBusy, error } = useStructureAction();
  const [draft, setDraft] = useState<OrgDraft>(() => draftOf(org));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input = toInput(draft);
    if (typeof input === "string") return setLocalError(input);
    setLocalError(null);
    if (await run(() => setOrganizationBilling(org.id, input))) onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <RequiredSwitch draft={draft} onChange={setDraft} />
      {draft.required && <PlanFields draft={draft} offers={offers} onChange={setDraft} />}
      {org.billing.required && (
        <p className="text-xs text-muted-foreground">
          Un changement de prix s&apos;applique au prochain abonnement souscrit, pas à un abonnement déjà en cours.
        </p>
      )}
      <InlineError message={localError ?? error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>Annuler</Button>
        <SubmitButton isBusy={isBusy} label="Enregistrer" />
      </DialogFooter>
    </form>
  );
}
