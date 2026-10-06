"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Plus } from "lucide-react";
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
import { useStructureAction } from "../../structure/use-structure-action";
import { setOrganizationArchived, type OrgListItem } from "./actions";
import { AttachUserDialog, CreateOrganizationDialog, RenameDialog } from "./organization-dialogs";

type Dialog = { kind: "create" } | { kind: "rename" | "attach" | "archive"; org: OrgListItem } | null;

export function OrganizationsClient({ organizations }: { organizations: OrgListItem[] }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/users" aria-label="Retour aux utilisateurs">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <Building2 className="h-5 w-5 text-red-700 dark:text-red-300" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Structures</h1>
              <p className="text-sm text-muted-foreground">
                Entreprises et associations à plusieurs comptes. Chaque structure est gérée par son administrateur.
              </p>
            </div>
          </div>
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nouvelle structure
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune structure pour l&apos;instant.</p>
        ) : (
          <ul className="max-w-4xl divide-y rounded-lg border" aria-label="Structures">
            {organizations.map((org) => (
              <OrganizationItem key={org.id} org={org} onOpen={(kind) => setDialog({ kind, org })} />
            ))}
          </ul>
        )}
      </div>

      <CreateOrganizationDialog open={dialog?.kind === "create"} onClose={close} />
      <RenameDialog org={dialog?.kind === "rename" ? dialog.org : null} onClose={close} />
      <AttachUserDialog org={dialog?.kind === "attach" ? dialog.org : null} onClose={close} />
      <ArchiveDialog org={dialog?.kind === "archive" ? dialog.org : null} onClose={close} />
    </div>
  );
}

function OrganizationItem({ org, onOpen }: { org: OrgListItem; onOpen: (kind: "rename" | "attach" | "archive") => void }) {
  const { run, isBusy } = useStructureAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-medium">{org.name}</p>
        <p className="text-sm text-muted-foreground">
          {org.memberCount} compte(s) actif(s) · Administrateur(s) : {org.admins.join(", ") || "aucun"}
        </p>
        {org.archived && <Badge variant="outline" className="mt-1">Archivée (aucun accès pour ses membres)</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpen("rename")} aria-label={`Renommer ${org.name}`}>Renommer</Button>
        <Button variant="outline" size="sm" onClick={() => onOpen("attach")} disabled={org.archived} aria-label={`Rattacher un compte à ${org.name}`}>
          Rattacher un compte
        </Button>
        {org.archived ? (
          <Button variant="ghost" size="sm" aria-disabled={isBusy} aria-label={`Réactiver ${org.name}`} onClick={() => !isBusy && run(() => setOrganizationArchived(org.id, false), "Structure réactivée")}>
            Réactiver
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onOpen("archive")} aria-label={`Archiver ${org.name}`}>Archiver</Button>
        )}
      </div>
    </li>
  );
}

function ArchiveDialog({ org, onClose }: { org: OrgListItem | null; onClose: () => void }) {
  const { run, isBusy } = useStructureAction();
  async function handleConfirm() {
    if (org) await run(() => setOrganizationArchived(org.id, true), "Structure archivée");
    onClose();
  }
  return (
    <AlertDialog open={org !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archiver {org?.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ses {org?.memberCount ?? 0} compte(s) actif(s) perdent immédiatement l&apos;accès aux
            dossiers et à l&apos;administration, même s&apos;ils sont connectés. Rien n&apos;est
            supprimé : vous pourrez la réactiver.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Annuler</AlertDialogCancel>
          <AlertDialogAction disabled={isBusy} onClick={handleConfirm}>Archiver</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
