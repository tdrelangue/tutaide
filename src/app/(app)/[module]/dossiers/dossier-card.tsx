"use client";

import { FileText, Pencil } from "lucide-react";
import { cn, formatRelativeTime, truncateFilename } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DossierWithDocuments } from "./actions";

interface DossierCardProps {
  dossier: DossierWithDocuments;
  onSelect: () => void;
  isSelected: boolean;
  selectionMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: () => void;
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

export function DossierCard({
  dossier,
  onSelect,
  isSelected,
  selectionMode = false,
  isChecked = false,
  onToggleCheck,
}: DossierCardProps) {
  const extraDocCount = dossier._count.documents - 3;

  const handleCardClick = () => {
    if (selectionMode && onToggleCheck) {
      onToggleCheck();
    } else {
      onSelect();
    }
  };

  return (
    <Card
      role="listitem"
      className={cn(
        "relative cursor-pointer transition-all hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        isSelected && "ring-2 ring-ring ring-offset-2",
        selectionMode && isChecked && "ring-2 ring-primary ring-offset-2 bg-primary/5"
      )}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-3 right-3 z-10">
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => onToggleCheck?.()}
            aria-label={`Selectionner le dossier de ${dossier.fullName}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <button
        onClick={handleCardClick}
        className="w-full text-left focus:outline-none"
        aria-label={
          selectionMode
            ? `${isChecked ? "Deselectionner" : "Selectionner"} le dossier de ${dossier.fullName}`
            : `Ouvrir le dossier de ${dossier.fullName}`
        }
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-medium leading-tight">
              {dossier.fullName}
            </CardTitle>
            <Badge
              variant={priorityVariants[dossier.priority]}
              className={cn(selectionMode && "mr-6")}
            >
              {priorityLabels[dossier.priority]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {dossier.documents.length > 0 ? (
            <div className="space-y-1.5">
              {dossier.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <FileText
                    className="h-3.5 w-3.5 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate flex-1" title={doc.filename}>
                    {truncateFilename(doc.filename, 25)}
                  </span>
                  <span
                    className="text-xs whitespace-nowrap"
                    suppressHydrationWarning
                  >
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

      {!selectionMode && (
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
      )}
    </Card>
  );
}
