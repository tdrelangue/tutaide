"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
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
import type { AuditRow } from "@/lib/organizations/audit";
import { undoJournalEntry } from "./actions";
import { InlineError, useStructureAction } from "./use-structure-action";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Every change made in this panel, newest first (who, what, for whom). */
export function JournalTab({ rows }: { rows: AuditRow[] }) {
  const [undoing, setUndoing] = useState<AuditRow | null>(null);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune modification enregistrée pour l&apos;instant.</p>;
  }
  return (
    <div className="max-w-4xl space-y-2">
      <p className="text-sm text-muted-foreground">
        Toutes les modifications faites dans l&apos;administration de la structure (200 dernières).
        Les réattributions et transferts peuvent être annulés ici, exactement.
      </p>
      <ol className="divide-y rounded-lg border" aria-label="Journal des modifications">
        {rows.map((row) => (
          <li key={row.id} className="grid items-center gap-1 px-4 py-2.5 text-sm sm:grid-cols-[9rem_1fr_auto]">
            <time className="text-muted-foreground" dateTime={row.createdAt.toISOString()}>
              {DATE_FORMAT.format(row.createdAt)}
            </time>
            <p>
              <span className="font-medium">{row.actorName}</span>
              {row.byOrigAI && <span className="text-muted-foreground"> (via le support OrigAI)</span>} · {row.action}
              {row.targetName && <> · <span className="font-medium">{row.targetName}</span></>}
              {row.details && <span className="text-muted-foreground"> — {row.details}</span>}
              {row.undoneAt && <span className="text-muted-foreground"> (annulé le {DATE_FORMAT.format(row.undoneAt)})</span>}
            </p>
            {row.canUndo ? (
              <Button variant="outline" size="sm" onClick={() => setUndoing(row)} aria-label={`Annuler : ${row.action}${row.targetName ? `, ${row.targetName}` : ""}`}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Annuler
              </Button>
            ) : (
              <span aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      <UndoDialog row={undoing} onClose={() => setUndoing(null)} />
    </div>
  );
}

function UndoDialog({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const { run, isBusy, error, clearError } = useStructureAction();

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (row && (await run(() => undoJournalEntry(row.id)))) onClose();
  }

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => { if (!open) { clearError(); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler « {row?.action} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Seul ce qui a été changé par cette opération est rétabli ({row?.details}). Ce qui a été
            modifié depuis n&apos;est pas touché.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <InlineError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Ne rien changer</AlertDialogCancel>
          <AlertDialogAction disabled={isBusy} onClick={handleConfirm}>Annuler l&apos;opération</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
