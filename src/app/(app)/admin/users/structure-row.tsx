"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUserData } from "../actions";
import type { OrgListItem } from "../organisations/actions";
import { setOrganizationArchived } from "../organisations/actions";
import { useStructureAction } from "../../structure/use-structure-action";
import { UserRow } from "./user-row";

export type OrgDialogKind = "rename" | "attach" | "archive" | "license";

export type UserHandlers = {
  readonly onEdit: (user: AdminUserData) => void;
  readonly onArchive: (user: AdminUserData) => void;
  readonly onUnarchive: (user: AdminUserData) => void;
  readonly onImpersonate: (user: AdminUserData) => void;
  readonly onInspectImap: (user: AdminUserData) => void;
};

type StructureRowProps = {
  readonly org: OrgListItem;
  /** Its accounts (already filtered by the search and status filter). */
  readonly members: readonly AdminUserData[];
  /** Open by default, e.g. when the search matched one of its accounts. */
  readonly defaultOpen: boolean;
  readonly onOrgAction: (kind: OrgDialogKind, org: OrgListItem) => void;
  readonly handlers: UserHandlers;
};

/**
 * A structure among the clients: a summary line, and its accounts once opened
 * (each with the same actions as an individual client's account).
 */
export function StructureRow({ org, members, defaultOpen, onOrgAction, handlers }: StructureRowProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = `structure-${org.id}-accounts`;
  const dossiers = members.reduce((sum, m) => sum + m._count.dossiers, 0);

  function handleToggle() {
    setIsOpen((open) => !open);
  }

  return (
    <div className={`rounded-lg border ${org.archived ? "bg-muted/50" : "bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <StructureSummary org={org} dossiers={dossiers} />
        </button>
        <StructureActions org={org} onOrgAction={onOrgAction} />
      </div>
      {isOpen && (
        <div id={panelId} className="space-y-2 border-t bg-muted/30 p-3 sm:pl-10">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun compte ne correspond à la recherche dans cette structure.</p>
          ) : (
            members.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onEdit={() => handlers.onEdit(user)}
                onArchive={() => handlers.onArchive(user)}
                onUnarchive={() => handlers.onUnarchive(user)}
                onImpersonate={() => handlers.onImpersonate(user)}
                onInspectImap={() => handlers.onInspectImap(user)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StructureSummary({ org, dossiers }: { org: OrgListItem; dossiers: number }) {
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="truncate font-medium">{org.name}</span>
        <Badge variant="secondary" className="text-xs">Structure</Badge>
        {org.archived && <Badge variant="outline" className="text-xs">Archivée : aucun accès</Badge>}
        {org.hasLicense && <Badge variant="outline" className="text-xs">Serveur auto-hébergé</Badge>}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
        <span>
          {org.memberCount} compte{org.memberCount > 1 ? "s" : ""} actif{org.memberCount > 1 ? "s" : ""}
        </span>
        <span>Administrateur(s) : {org.admins.join(", ") || "aucun"}</span>
        <span className="flex items-center gap-1">
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          {dossiers} dossier{dossiers > 1 ? "s" : ""}
        </span>
      </span>
    </span>
  );
}

function StructureActions({ org, onOrgAction }: { org: OrgListItem; onOrgAction: (kind: OrgDialogKind, org: OrgListItem) => void }) {
  const { run, isBusy } = useStructureAction();
  function handleReactivate() {
    if (!isBusy) void run(() => setOrganizationArchived(org.id, false), "Structure réactivée");
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => onOrgAction("attach", org)} disabled={org.archived} aria-label={`Rattacher un compte à ${org.name}`}>
        Rattacher un compte
      </Button>
      <Button variant="outline" size="sm" onClick={() => onOrgAction("rename", org)} aria-label={`Renommer ${org.name}`}>
        Renommer
      </Button>
      <Button variant="outline" size="sm" onClick={() => onOrgAction("license", org)} aria-label={`Clé de licence serveur de ${org.name}`}>
        Clé de licence
      </Button>
      {org.archived ? (
        <Button variant="ghost" size="sm" aria-disabled={isBusy} onClick={handleReactivate} aria-label={`Réactiver ${org.name}`}>
          Réactiver
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => onOrgAction("archive", org)} aria-label={`Archiver ${org.name}`}>
          Archiver
        </Button>
      )}
    </div>
  );
}
