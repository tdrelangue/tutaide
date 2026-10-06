"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { MemberRow } from "@/lib/organizations/overview";
import { archiveMember } from "./actions";
import { MemberDialog } from "./member-dialog";
import { ROLE_LABELS, toRoleChoice } from "./labels";
import { useStructureAction } from "./use-structure-action";

export function MembersTab({ members, currentUserId }: { members: MemberRow[]; currentUserId: string }) {
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [archiving, setArchiving] = useState<MemberRow | null>(null);
  const { run, isBusy } = useStructureAction();

  async function handleArchiveToggle(member: MemberRow) {
    if (isBusy) return;
    await run(() => archiveMember(member.id, !member.archived), member.archived ? "Compte réactivé" : "Compte archivé");
    setArchiving(null);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.filter((m) => !m.archived).length} compte(s) actif(s)</p>
        <Button onClick={() => setIsCreating(true)}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Ajouter un membre
        </Button>
      </div>
      <ul className="divide-y rounded-lg border" aria-label="Membres de la structure">
        {members.map((member) => (
          <MemberItem
            key={member.id}
            member={member}
            isSelf={member.id === currentUserId}
            isBusy={isBusy}
            onEdit={() => setEditing(member)}
            onArchiveToggle={() => (member.archived ? handleArchiveToggle(member) : setArchiving(member))}
          />
        ))}
      </ul>
      <MemberDialog
        open={isCreating || editing !== null}
        member={editing}
        isSelf={editing?.id === currentUserId}
        onClose={() => { setIsCreating(false); setEditing(null); }}
      />
      <ArchiveConfirm member={archiving} isBusy={isBusy} onConfirm={handleArchiveToggle} onCancel={() => setArchiving(null)} />
    </div>
  );
}

type ItemProps = { member: MemberRow; isSelf: boolean; isBusy: boolean; onEdit: () => void; onArchiveToggle: () => void };

function MemberItem({ member, isSelf, isBusy, onEdit, onArchiveToggle }: ItemProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {member.name} {isSelf && <span className="text-sm font-normal text-muted-foreground">(vous)</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{ROLE_LABELS[toRoleChoice(member.orgRole)]}</Badge>
          {member.isOrgAdmin && <Badge variant="outline">Administrateur</Badge>}
          {member.orgRole === "MANDATAIRE" && <Badge variant="outline">{member.dossierCount} dossier(s)</Badge>}
          {member.archived && <Badge variant="outline">Archivé (ne peut plus se connecter)</Badge>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={isBusy} aria-label={`Modifier ${member.name}`}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Modifier
        </Button>
        {!isSelf && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArchiveToggle}
            aria-disabled={isBusy}
            aria-label={`${member.archived ? "Réactiver" : "Archiver"} ${member.name}`}
          >
            {member.archived ? "Réactiver" : "Archiver"}
          </Button>
        )}
      </div>
    </li>
  );
}

type ArchiveProps = { member: MemberRow | null; isBusy: boolean; onConfirm: (m: MemberRow) => void; onCancel: () => void };

function ArchiveConfirm({ member, isBusy, onConfirm, onCancel }: ArchiveProps) {
  return (
    <AlertDialog open={member !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archiver {member?.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ce compte ne pourra plus se connecter, y compris s&apos;il est connecté en ce moment.
            Rien n&apos;est supprimé : vous pourrez le réactiver à tout moment.
            {member?.orgRole === "MANDATAIRE" && member.dossierCount > 0 &&
              ` Ses ${member.dossierCount} dossier(s) doivent d'abord être transférés (onglet Répartition).`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Annuler</AlertDialogCancel>
          <AlertDialogAction disabled={isBusy} onClick={() => member && onConfirm(member)}>Archiver</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
