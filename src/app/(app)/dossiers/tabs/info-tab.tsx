"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Mail, Calendar, FileText } from "lucide-react";
import type { DossierWithDocuments } from "../actions";

interface InfoTabProps {
  dossier: DossierWithDocuments;
}

export function InfoTab({ dossier }: InfoTabProps) {
  return (
    <div className="space-y-6">
      {/* Notes */}
      <div>
        <h4 className="font-medium mb-2">Notes</h4>
        {dossier.notes ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {dossier.notes}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Aucune note pour ce dossier
          </p>
        )}
      </div>

      {/* Contact Info */}
      <div>
        <h4 className="font-medium mb-2">Informations de contact</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Email principal :</span>
            {dossier.primaryEmail ? (
              <a
                href={`mailto:${dossier.primaryEmail}`}
                className="text-primary hover:underline"
              >
                {dossier.primaryEmail}
              </a>
            ) : (
              <span className="italic text-muted-foreground">Non renseigné</span>
            )}
          </div>

          {dossier.ccEmails.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" aria-hidden="true" />
              <span className="text-muted-foreground">CC :</span>
              <span>{dossier.ccEmails.join(", ")}</span>
            </div>
          )}

          {dossier.bccEmails.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" aria-hidden="true" />
              <span className="text-muted-foreground">BCC :</span>
              <span>{dossier.bccEmails.join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div>
        <h4 className="font-medium mb-2">Informations</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Créé le :</span>
            <span>
              {format(new Date(dossier.createdAt), "d MMMM yyyy 'à' HH:mm", {
                locale: fr,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Modifié le :</span>
            <span>
              {format(new Date(dossier.updatedAt), "d MMMM yyyy 'à' HH:mm", {
                locale: fr,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Documents :</span>
            <span>{dossier._count.documents}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
