"use client";

import { FileText, Pencil } from "lucide-react";
import { cn, formatRelativeTime, truncateFilename } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DossierWithDocuments } from "./actions";

interface DossierCardProps {
  dossier: DossierWithDocuments;
  onSelect: () => void;
  isSelected: boolean;
}

const priorityLabels = {
  NORMAL: "Normal",
  PRIORITAIRE: "Prioritaire",
  URGENT: "Urgent",
};

const priorityVariants = {
  NORMAL: "normal",
  PRIORITAIRE: "prioritaire",
  URGENT: "urgent",
} as const;

export function DossierCard({ dossier, onSelect, isSelected }: DossierCardProps) {
  const extraDocCount = dossier._count.documents - 3;

  return (
    <Card
      role="listitem"
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        isSelected && "ring-2 ring-ring ring-offset-2"
      )}
    >
      <button
        onClick={onSelect}
        className="w-full text-left focus:outline-none"
        aria-label={`Ouvrir le dossier de ${dossier.fullName}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-medium leading-tight">
              {dossier.fullName}
            </CardTitle>
            <Badge variant={priorityVariants[dossier.priority]}>
              {priorityLabels[dossier.priority]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {dossier.documents.length > 0 ? (
            <div className="space-y-1.5">
              {dossier.documents.slice(0, 3).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate flex-1" title={doc.filename}>
                    {truncateFilename(doc.filename, 25)}
                  </span>
                  <span className="text-xs whitespace-nowrap" suppressHydrationWarning>
                    {formatRelativeTime(new Date(doc.createdAt))}
                  </span>
                </div>
              ))}
              {extraDocCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{extraDocCount} fichier{extraDocCount > 1 ? "s" : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun document</p>
          )}
        </CardContent>
      </button>
      <div className="px-6 pb-4 pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={`Modifier le dossier de ${dossier.fullName}`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
