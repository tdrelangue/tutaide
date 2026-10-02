"use client";

import { formatRelativeTime } from "@/lib/utils";
import type { DossierWithDocuments, GroupMember } from "../actions";

interface InfoTabProps {
  dossier: DossierWithDocuments;
  groupMembers?: GroupMember[];
}

export function InfoTab({ dossier, groupMembers = [] }: InfoTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Module</h4>
        <p className="mt-1">{dossier.moduleType}</p>
      </div>

      {groupMembers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Dossier(s) lié(s)</h4>
          <p className="mt-1 text-sm">
            Lié au module {groupMembers.map((m) => m.moduleType).join(", ")}
          </p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Email principal</h4>
        <p className="mt-1">{dossier.primaryEmail || "Non renseigné"}</p>
      </div>

      {dossier.ccEmails.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">CC</h4>
          <p className="mt-1 text-sm">{dossier.ccEmails.join(", ")}</p>
        </div>
      )}

      {dossier.bccEmails.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">BCC</h4>
          <p className="mt-1 text-sm">{dossier.bccEmails.join(", ")}</p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Modèle par défaut</h4>
        <p className="mt-1 text-sm">
          {dossier.defaultTemplate?.name ?? "Modèle global du module"}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
        <p className="mt-1 text-sm whitespace-pre-wrap">
          {dossier.notes || "Aucune note"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h4 className="font-medium text-muted-foreground">Créé le</h4>
          <p className="mt-1" suppressHydrationWarning>
            {new Date(dossier.createdAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div>
          <h4 className="font-medium text-muted-foreground">Modifié</h4>
          <p className="mt-1" suppressHydrationWarning>
            {formatRelativeTime(new Date(dossier.updatedAt))}
          </p>
        </div>
      </div>
    </div>
  );
}
