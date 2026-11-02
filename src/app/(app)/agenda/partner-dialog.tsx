"use client";

import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AgendaGroupView } from "@/lib/agenda/groups";
import { groupOf } from "@/lib/agenda/groups-rules";
import type { AgendaPartnerView } from "@/lib/agenda/partners";
import { partnerName } from "@/lib/agenda/rules";
import type { Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT, PENDING_ADDRESS_ERROR } from "./address-field";
import { saveAgendaPartner } from "./actions";
import { useAgendaAction } from "./use-agenda-action";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = new contact. */
  partner: AgendaPartnerView | null;
  groups: AgendaGroupView[];
};

type TextKey = "civility" | "lastName" | "firstName" | "company" | "role" | "phone" | "mobile" | "email" | "notes";
type Texts = Record<TextKey, string>;

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function initialTexts(p: AgendaPartnerView | null): Texts {
  return {
    civility: p?.civility ?? "",
    lastName: p?.lastName ?? "",
    firstName: p?.firstName ?? "",
    company: p?.company ?? "",
    role: p?.role ?? "",
    phone: p?.phone ?? "",
    mobile: p?.mobile ?? "",
    email: p?.email ?? "",
    notes: p?.notes ?? "",
  };
}

const orNull = (text: string) => text.trim() || null;

/** A contact of the structure's address book: lawyer, notary, craftsman… (Thomas, 2026-11-02). */
export function PartnerDialog({ open, onOpenChange, partner, groups }: Props) {
  const [texts, setTexts] = useState<Texts>(() => initialTexts(partner));
  const [groupId, setGroupId] = useState<string | null>(() => groupOf(partner?.groupId ?? null, groups)?.id ?? null);
  const [address, setAddress] = useState<Place | null>(partner?.address ?? null);
  const [isAddressPending, setIsAddressPending] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; address?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { run, isBusy, error } = useAgendaAction();

  function handleText(key: TextKey) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      setTexts((current) => ({ ...current, [key]: event.target.value }));
    };
  }

  function handleGroupChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setGroupId(event.target.value);
  }

  /** Same rules as the server, focusing the first problem. */
  function checkFields(): boolean {
    const found: typeof errors = {};
    if (!orNull(texts.lastName) && !orNull(texts.company)) found.name = "Indiquez un nom ou une structure.";
    if (orNull(texts.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texts.email.trim())) found.email = "Adresse e-mail invalide.";
    if (isAddressPending) found.address = PENDING_ADDRESS_ERROR;
    setErrors(found);
    if (found.name) nameRef.current?.focus();
    else if (found.email) emailRef.current?.focus();
    return Object.keys(found).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkFields()) return;
    const payload = {
      groupId,
      civility: orNull(texts.civility),
      lastName: orNull(texts.lastName),
      firstName: orNull(texts.firstName),
      company: orNull(texts.company),
      role: orNull(texts.role),
      phone: orNull(texts.phone),
      mobile: orNull(texts.mobile),
      email: orNull(texts.email),
      address,
      notes: orNull(texts.notes),
    };
    if (await run(() => saveAgendaPartner(partner?.id ?? null, payload))) onOpenChange(false);
  }

  const title = partner ? partnerName(partner) : "Ajouter un contact";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Avocat, notaire, artisan… Ce contact est visible par toute votre structure.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <fieldset disabled={isBusy} className="space-y-4">
            {groups.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="partner-group">Groupe</Label>
                <select id="partner-group" value={groupId ?? ""} onChange={handleGroupChange} className={SELECT_CLASS}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
              <TextField id="partner-civility" label="Civilité" value={texts.civility} onChange={handleText("civility")} placeholder="Me, M., Mme" />
              <TextField
                ref={nameRef}
                id="partner-last-name"
                label="Nom"
                value={texts.lastName}
                onChange={handleText("lastName")}
                error={errors.name}
              />
              <TextField id="partner-first-name" label="Prénom" value={texts.firstName} onChange={handleText("firstName")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="partner-company" label="Structure" value={texts.company} onChange={handleText("company")} placeholder="ex. Étude Terieur" />
              <TextField id="partner-role" label="Fonction" value={texts.role} onChange={handleText("role")} placeholder="ex. Notaire associé" />
            </div>
            <p className="text-xs text-muted-foreground">Un nom ou une structure suffit.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="partner-phone" label="Téléphone" type="tel" value={texts.phone} onChange={handleText("phone")} />
              <TextField id="partner-mobile" label="Portable" type="tel" value={texts.mobile} onChange={handleText("mobile")} />
            </div>
            <TextField ref={emailRef} id="partner-email" label="E-mail" type="email" value={texts.email} onChange={handleText("email")} error={errors.email} />

            <AddressField
              label="Adresse"
              hint="Cabinet, étude, atelier…"
              value={address}
              onChange={setAddress}
              onPendingChange={setIsAddressPending}
              disabled={isBusy}
            />
            {errors.address && <p role="alert" className={ERROR_TEXT}>{errors.address}</p>}

            <div className="space-y-1">
              <Label htmlFor="partner-notes">Notes pratiques (facultatif)</Label>
              <Textarea
                id="partner-notes"
                value={texts.notes}
                onChange={handleText("notes")}
                rows={2}
                placeholder="ex. horaires, secrétariat, accès…"
              />
            </div>
          </fieldset>

          {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
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

type TextFieldProps = {
  ref?: React.Ref<HTMLInputElement>;
  id: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: "text" | "tel" | "email";
  placeholder?: string;
  error?: string;
};

function TextField({ ref, id, label, value, onChange, type = "text", placeholder, error }: TextFieldProps) {
  const errorId = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={ref}
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        inputMode={type === "tel" ? "tel" : undefined}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <p id={errorId} className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}
