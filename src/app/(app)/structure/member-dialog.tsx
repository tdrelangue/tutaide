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
import type { MemberRow } from "@/lib/organizations/overview";
import { addMember, editMember } from "./actions";
import { fromRoleChoice, ROLE_LABELS, ROLE_NONE, toRoleChoice, type RoleChoice } from "./labels";
import { useStructureAction } from "./use-structure-action";

type FormState = { name: string; email: string; password: string; role: RoleChoice; isOrgAdmin: boolean };

const EMPTY: FormState = { name: "", email: "", password: "", role: "MANDATAIRE", isOrgAdmin: false };

function initialState(member: MemberRow | null): FormState {
  if (!member) return EMPTY;
  return { name: member.name, email: member.email, password: "", role: toRoleChoice(member.orgRole), isOrgAdmin: member.isOrgAdmin };
}

/** Create a member (member = null) or edit one. */
export function MemberDialog({ open, member, isSelf = false, onClose }: { open: boolean; member: MemberRow | null; isSelf?: boolean; onClose: () => void }) {
  const { run, isBusy } = useStructureAction();
  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (open) setForm(initialState(member));
  }, [open, member]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const orgRole = fromRoleChoice(form.role);
    const roleUpdate = isSelf ? {} : { orgRole };
    const action = member
      ? () => editMember(member.id, { name: form.name, ...roleUpdate, isOrgAdmin: form.isOrgAdmin, password: form.password || undefined })
      : () => addMember({ name: form.name, email: form.email, password: form.password, orgRole, isOrgAdmin: form.isOrgAdmin });
    if (await run(action, member ? "Compte mis à jour" : undefined)) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? `Modifier ${member.name}` : "Ajouter un membre"}</DialogTitle>
          <DialogDescription>
            Le rôle détermine l&apos;accès aux dossiers. L&apos;accès à l&apos;administration de la
            structure se coche à part et ne donne accès à aucun dossier.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <MemberFields form={form} isNew={!member} isSelf={isSelf} isBusy={isBusy} onChange={update} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>Annuler</Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {member ? "Enregistrer" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldsProps = { form: FormState; isNew: boolean; isSelf: boolean; isBusy: boolean; onChange: (patch: Partial<FormState>) => void };

function MemberFields({ form, isNew, isSelf, isBusy, onChange }: FieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="member-name">Nom</Label>
        <Input id="member-name" required value={form.name} disabled={isBusy} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="member-email">Email (identifiant de connexion)</Label>
          <Input id="member-email" type="email" required value={form.email} disabled={isBusy} onChange={(e) => onChange({ email: e.target.value })} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="member-password">{isNew ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}</Label>
        <Input
          id="member-password"
          type="password"
          minLength={8}
          required={isNew}
          value={form.password}
          disabled={isBusy}
          onChange={(e) => onChange({ password: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-role">Rôle</Label>
        <Select value={form.role} onValueChange={(value) => onChange({ role: value as RoleChoice })} disabled={isBusy || isSelf}>
          <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["MANDATAIRE", "ASSISTANT", ROLE_NONE] as RoleChoice[]).map((role) => (
              <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSelf && (
          <p className="text-xs text-muted-foreground">Votre propre rôle ne peut être changé que par un autre administrateur.</p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="member-admin" checked={form.isOrgAdmin} disabled={isBusy} onCheckedChange={(v) => onChange({ isOrgAdmin: v === true })} />
        <Label htmlFor="member-admin" className="font-normal leading-snug">
          Administrateur de la structure (gestion des comptes et de la répartition, sans accès aux dossiers)
        </Label>
      </div>
    </>
  );
}
