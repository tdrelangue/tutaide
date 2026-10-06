"use client";

import { CheckCircle, FolderInput, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AshImportResult } from "./use-ash-import";

interface AshImportResultsProps {
  results: AshImportResult[];
  unsortedCount: number;
  onSortByHand: () => void;
}

/** Outcome of the last ASH import, with the way out for files it could not place. */
export function AshImportResults({ results, unsortedCount, onSortByHand }: AshImportResultsProps) {
  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.length - okCount;

  return (
    <div className="space-y-1" role="status">
      <p className="text-xs font-medium text-muted-foreground">
        Résultat : {okCount} importé{okCount !== 1 ? "s" : ""}
        {errCount > 0 && `, ${errCount} échec${errCount !== 1 ? "s" : ""}`}
      </p>
      {unsortedCount > 0 && (
        <Button size="sm" className="my-1" onClick={onSortByHand}>
          <FolderInput className="mr-2 h-4 w-4" aria-hidden="true" />
          Ranger à la main ({unsortedCount} fichier{unsortedCount > 1 ? "s" : ""} non reconnu{unsortedCount > 1 ? "s" : ""})
        </Button>
      )}
      {results.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          {r.status === "ok" ? (
            <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            {r.status === "ok" ? (
              <>
                <span className="font-medium">{r.periodLabel}</span>
                {r.created && <span className="ml-1 text-muted-foreground">(dossier créé)</span>}
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{r.filename}</span>
                {" — "}
                <span className="text-destructive">{r.error}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
