"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineError, useStructureAction } from "../../structure/use-structure-action";
import { fromRoleChoice, ROLE_LABELS, ROLE_NONE, type RoleChoice } from "../../structure/labels";
import { attachExistingUser, createOrganization, generateLicenseKey, renameOrganization, type OrgListItem } from "./actions";

const ROLES: RoleChoice[] = ["MANDATAIRE", "ASSISTANT", ROLE_NONE];

function RoleSelect({ id, value, onChange }: { id: string; value: RoleChoice; onChange: (v: RoleChoice) => void }) {
  return (
    // Radix returns the value of one of the SelectItems below, all RoleChoice values.
    <Select value={value} onValueChange={(v) => onChange(v as RoleChoice)}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function FormDialog(props: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  isBusy: boolean;
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
          {props.children}
          <InlineError message={props.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose} disabled={props.isBusy}>Annuler</Button>
            <Button type="submit" disabled={props.isBusy}>
              {props.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_CREATE = { orgName: "", name: "", email: "", password: "", role: ROLE_NONE as RoleChoice };

export function CreateOrganizationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, isBusy, error } = useStructureAction();
  const [form, setForm] = useState(EMPTY_CREATE);
  useEffect(() => { if (open) setForm(EMPTY_CREATE); }, [open]);
  const set = (patch: Partial<typeof EMPTY_CREATE>) => setForm((prev) => ({ ...prev, ...patch }));

  async function handleSubmit() {
    const admin = { name: form.name, email: form.email, password: form.password, orgRole: fromRoleChoice(form.role), isOrgAdmin: true };
    if (await run(() => createOrganization({ name: form.orgName, admin }), "Structure créée")) onClose();
  }

  return (
    <FormDialog open={open} title="Nouvelle structure" submitLabel="Créer la structure" isBusy={isBusy} error={error} onSubmit={handleSubmit} onClose={onClose}
      description="La structure est créée avec son premier administrateur, qui ajoutera ensuite les autres comptes.">
      <Field id="org-name" label="Nom de la structure">
        <Input id="org-name" required value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} />
      </Field>
      <p className="text-sm font-medium">Premier administrateur</p>
      <Field id="admin-name" label="Nom">
        <Input id="admin-name" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field id="admin-email" label="Email">
        <Input id="admin-email" type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <Field id="admin-password" label="Mot de passe provisoire">
        <Input id="admin-password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="admin-password-hint"
          value={form.password} onChange={(e) => set({ password: e.target.value })} />
        <p id="admin-password-hint" className="text-xs text-muted-foreground">8 caractères minimum. À communiquer à l&apos;administrateur.</p>
      </Field>
      <Field id="admin-role" label="Rôle dans la structure (en plus de l'administration)">
        <RoleSelect id="admin-role" value={form.role} onChange={(role) => set({ role })} />
      </Field>
    </FormDialog>
  );
}

export function RenameDialog({ org, onClose }: { org: OrgListItem | null; onClose: () => void }) {
  const { run, isBusy, error } = useStructureAction();
  const [name, setName] = useState("");
  useEffect(() => { if (org) setName(org.name); }, [org]);

  async function handleSubmit() {
    if (org && (await run(() => renameOrganization(org.id, name), "Structure renommée"))) onClose();
  }

  return (
    <FormDialog open={org !== null} title="Renommer la structure" description="Le nouveau nom est visible par tous ses membres."
      submitLabel="Renommer" isBusy={isBusy} error={error} onSubmit={handleSubmit} onClose={onClose}>
      <Field id="rename-org" label="Nom">
        <Input id="rename-org" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function AttachUserDialog({ org, onClose }: { org: OrgListItem | null; onClose: () => void }) {
  const { run, isBusy, error } = useStructureAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleChoice>("MANDATAIRE");
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  useEffect(() => { if (org) { setEmail(""); setRole("MANDATAIRE"); setIsOrgAdmin(false); } }, [org]);

  async function handleSubmit() {
    if (!org) return;
    const done = await run(() => attachExistingUser(org.id, { email, orgRole: fromRoleChoice(role), isOrgAdmin }), "Compte rattaché");
    if (done) onClose();
  }

  return (
    <FormDialog open={org !== null} title={`Rattacher un compte à ${org?.name ?? ""}`} submitLabel="Rattacher" isBusy={isBusy} error={error}
      onSubmit={handleSubmit} onClose={onClose}
      description="Un compte individuel existant rejoint la structure avec ses dossiers (un compte qui a des dossiers est rattaché comme mandataire).">
      <Field id="attach-email" label="Email du compte">
        <Input id="attach-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="attach-role" label="Rôle">
        <RoleSelect id="attach-role" value={role} onChange={setRole} />
      </Field>
      <div className="flex items-start gap-2">
        <Checkbox id="attach-admin" checked={isOrgAdmin} onCheckedChange={(v) => setIsOrgAdmin(v === true)} />
        <Label htmlFor="attach-admin" className="font-normal">Administrateur de la structure</Label>
      </div>
    </FormDialog>
  );
}

/**
 * Licence key of a self-hosted server: generated here, shown once, to put in
 * the server's .env. Generating again replaces (and invalidates) the old one.
 */
export function LicenseDialog({ org, onClose }: { org: OrgListItem | null; onClose: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  useEffect(() => { setKey(null); setError(null); }, [org]);

  async function handleGenerate() {
    if (!org) return;
    setIsBusy(true);
    const result = await generateLicenseKey(org.id);
    setIsBusy(false);
    if (result.success) setKey(result.key);
    else setError(result.error);
  }

  return (
    <Dialog open={org !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Licence du serveur de {org?.name}</DialogTitle>
          <DialogDescription>
            Pour une structure qui héberge Tutellia sur son propre serveur. La clé se met dans le
            fichier .env du serveur (TUTELLIA_LICENSE_KEY).
            {org?.hasLicense && " Une clé existe déjà : en générer une nouvelle rend l'ancienne invalide."}
          </DialogDescription>
        </DialogHeader>
        {key ? (
          <div className="space-y-2">
            <Label htmlFor="license-key">Clé (affichée une seule fois)</Label>
            <Input id="license-key" readOnly value={key} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(key)}>Copier la clé</Button>
          </div>
        ) : (
          <Button type="button" onClick={handleGenerate} disabled={isBusy}>
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {org?.hasLicense ? "Remplacer la clé" : "Générer la clé"}
          </Button>
        )}
        <InlineError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
