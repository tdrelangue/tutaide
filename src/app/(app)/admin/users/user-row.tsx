"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Archive, ArchiveRestore, Eye, FolderOpen, FolderTree, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminUserData } from "../actions";
import { ROLE_LABELS, toRoleChoice } from "../../structure/labels";
import { centsToEuros } from "./billing-required-field";

/** Role of a structure member, shown on their row inside the structure. */
function OrgRoleBadges({ user }: { user: AdminUserData }) {
  if (user.orgId === null) return null;
  return (
    <>
      <Badge variant="secondary" className="text-xs">{ROLE_LABELS[toRoleChoice(user.orgRole)]}</Badge>
      {user.isOrgAdmin && <Badge variant="outline" className="text-xs">Administrateur de la structure</Badge>}
    </>
  );
}

/** One account: name, billing, status, dossier count, and the super-admin actions. */
export function UserRow({
  user,
  onEdit,
  onArchive,
  onUnarchive,
  onImpersonate,
  onInspectImap,
}: {
  user: AdminUserData;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onImpersonate: () => void;
  onInspectImap: () => void;
}) {
  const isArchived = !!user.archivedAt;

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isArchived ? "bg-muted/50 opacity-75" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {user.name || user.email}
            </span>
            <OrgRoleBadges user={user} />
            {user.role === "ADMIN" && (
              <Badge variant="destructive" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}
            {/* A structure's members are billed by the structure (see its line), never one by one. */}
            {user.orgId === null && <Badge variant="outline" className="text-xs">
              {!user.billingRequired
                ? "Offert"
                : user.billingCustomAmountCents === null
                  ? "Payant · Individuel"
                  : `Payant · Entreprise ${centsToEuros(user.billingCustomAmountCents)} €/an`}
              {user.billingRequired && user.billingStartsAt && new Date(user.billingStartsAt) > new Date()
                ? ` · dès le ${new Date(user.billingStartsAt).toLocaleDateString("fr-FR")}`
                : ""}
            </Badge>}
            {user.agendaGranted && (
              <Badge variant="outline" className="text-xs">Agenda offert</Badge>
            )}
            {isArchived ? (
              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Archive
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                Actif
              </Badge>
            )}
          </div>
          {user.name && (
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" />
            {user._count.dossiers}
          </span>
          <span className="text-xs">
            {format(new Date(user.createdAt), "d MMM yyyy", { locale: fr })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Modifier</TooltipContent>
        </Tooltip>

        {!isArchived && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onImpersonate}>
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Visualiser le compte</TooltipContent>
          </Tooltip>
        )}

        {!isArchived && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onInspectImap} aria-label="Dossiers de la messagerie">
                <FolderTree className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dossiers de la messagerie (IMAP)</TooltipContent>
          </Tooltip>
        )}

        {isArchived ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onUnarchive}>
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reactiver</TooltipContent>
          </Tooltip>
        ) : (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Archive className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Archiver</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archiver ce compte ?</AlertDialogTitle>
                <AlertDialogDescription>
                  L&apos;utilisateur <strong>{user.name || user.email}</strong> ne
                  pourra plus se connecter. Ses donnees seront conservees et le
                  compte pourra etre reactive ulterieurement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive}>
                  Archiver
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
