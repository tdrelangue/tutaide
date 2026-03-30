"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bulkSendAction } from "../history/actions";

interface SelectedDossier {
  id: string;
  fullName: string;
  primaryEmail: string | null;
  defaultTemplateName: string | null;
}

interface BulkSendResult {
  dossierId: string;
  fullName: string;
  success: boolean;
  error?: string;
}

interface BulkSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleType: "APA" | "ASH";
  selectedDossiers: SelectedDossier[];
}

export function BulkSendDialog({
  open,
  onOpenChange,
  moduleType,
  selectedDossiers,
}: BulkSendDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BulkSendResult[] | null>(null);

  const dossiersWithoutEmail = selectedDossiers.filter((d) => !d.primaryEmail);
  const dossiersWithEmail = selectedDossiers.filter((d) => !!d.primaryEmail);

  useEffect(() => {
    if (open) {
      setResults(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (dossiersWithEmail.length === 0) {
      toast.error("Aucun dossier selectionne ne possede d'adresse email");
      return;
    }

    setIsLoading(true);
    try {
      const actionResults = await bulkSendAction({
        dossierIds: dossiersWithEmail.map((d) => d.id),
        moduleType,
      });

      const mappedResults: BulkSendResult[] = actionResults.map((r) => {
        const dossier = selectedDossiers.find((d) => d.id === r.dossierId);
        return {
          dossierId: r.dossierId,
          fullName: dossier?.fullName || "Inconnu",
          success: r.success,
          error: r.error,
        };
      });
      setResults(mappedResults);

      const successCount = mappedResults.filter((r) => r.success).length;
      const failCount = mappedResults.filter((r) => !r.success).length;

      if (failCount === 0) {
        toast.success(`${successCount} email(s) envoye(s) avec succes`);
      } else {
        toast.warning(`${successCount} envoye(s), ${failCount} en echec`);
      }
    } catch {
      toast.error("Erreur lors de l'envoi groupe");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setResults(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Envoi groupe - Dossiers {moduleType}</DialogTitle>
          <DialogDescription>
            Envoyer un email a {selectedDossiers.length} dossier
            {selectedDossiers.length !== 1 ? "s" : ""} selectionne
            {selectedDossiers.length !== 1 ? "s" : ""}. Le modèle de chaque dossier
            sera utilisé automatiquement.
          </DialogDescription>
        </DialogHeader>

        {/* Results view */}
        {results ? (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Resultats de l&apos;envoi</h3>
            <ScrollArea className="h-64 border rounded-md p-3">
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.dossierId}
                    className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0"
                  >
                    <span className="text-sm truncate flex-1">{r.fullName}</span>
                    {r.success ? (
                      <Badge variant="active">Envoye</Badge>
                    ) : (
                      <Badge variant="urgent">
                        Echec{r.error ? `: ${r.error}` : ""}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button onClick={handleClose}>Fermer</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning for dossiers without email */}
            {dossiersWithoutEmail.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-950">
                <AlertTriangle
                  className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    {dossiersWithoutEmail.length} dossier
                    {dossiersWithoutEmail.length !== 1 ? "s" : ""} sans adresse email :
                  </p>
                  <ul className="mt-1 list-disc list-inside text-yellow-700 dark:text-yellow-300">
                    {dossiersWithoutEmail.map((d) => (
                      <li key={d.id}>{d.fullName}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-yellow-700 dark:text-yellow-300">
                    Ces dossiers seront ignores lors de l&apos;envoi.
                  </p>
                </div>
              </div>
            )}

            {/* Selected dossiers list with per-dossier template */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Destinataires ({dossiersWithEmail.length} dossier
                {dossiersWithEmail.length !== 1 ? "s" : ""})
              </p>
              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-1.5">
                  {selectedDossiers.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-sm py-0.5"
                    >
                      <span className="truncate flex-1 font-medium">{d.fullName}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {d.defaultTemplateName ?? "Modèle global"}
                      </span>
                      {d.primaryEmail ? (
                        <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                          {d.primaryEmail}
                        </span>
                      ) : (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          Pas d&apos;email
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || dossiersWithEmail.length === 0}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Envoi en cours...
                  </>
                ) : (
                  `Envoyer a ${dossiersWithEmail.length} dossier${dossiersWithEmail.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
