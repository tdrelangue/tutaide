"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { sendAllAction } from "../history/actions";

interface EligibleDossier {
  id: string;
  fullName: string;
  documentCount: number;
}

interface SendAllResult {
  dossierId: string;
  fullName: string;
  success: boolean;
  error?: string;
}

interface SendAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleType: "APA" | "ASH";
  eligibleDossiers: EligibleDossier[];
}

export function SendAllDialog({
  open,
  onOpenChange,
  moduleType,
  eligibleDossiers,
}: SendAllDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SendAllResult[] | null>(null);

  useEffect(() => {
    if (open) {
      setResults(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (eligibleDossiers.length === 0) {
      toast.error("Aucun dossier eligible a l'envoi");
      return;
    }

    setIsLoading(true);
    try {
      const actionResults = await sendAllAction({ moduleType });

      const mappedResults: SendAllResult[] = actionResults.map((r) => {
        const dossier = eligibleDossiers.find((d) => d.id === r.dossierId);
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
      toast.error("Erreur lors de l'envoi");
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
          <DialogTitle>Envoyer tout - Dossiers {moduleType}</DialogTitle>
          <DialogDescription>
            Envoyer un email avec les documents de chaque dossier actif non vide
            a l&apos;adresse de destination configuree dans les parametres.
            Le modèle de chaque dossier sera utilisé automatiquement.
          </DialogDescription>
        </DialogHeader>

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
            {/* Eligible dossiers list */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Dossiers eligibles ({eligibleDossiers.length})
              </p>
              <ScrollArea className="h-40 border rounded-md p-2">
                <div className="space-y-1.5">
                  {eligibleDossiers.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{d.fullName}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {d.documentCount} doc{d.documentCount !== 1 ? "s" : ""}
                      </span>
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
                disabled={isLoading || eligibleDossiers.length === 0}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Envoi en cours...
                  </>
                ) : (
                  `Envoyer tout (${eligibleDossiers.length})`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
