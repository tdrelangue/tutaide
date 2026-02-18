"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendAllAction } from "../history/actions";
import { getTemplates, type TemplateData } from "../../settings/actions";

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

const defaultTemplates: Record<"APA" | "ASH", { subject: string; body: string }> = {
  APA: {
    subject: "Dossier APA - Documents a transmettre",
    body: "Bonjour,\n\nVeuillez trouver ci-joint les documents relatifs aux dossiers APA.\n\nCordialement",
  },
  ASH: {
    subject: "Dossier ASH - Documents a transmettre",
    body: "Bonjour,\n\nVeuillez trouver ci-joint les documents relatifs aux dossiers ASH.\n\nCordialement",
  },
};

export function SendAllDialog({
  open,
  onOpenChange,
  moduleType,
  eligibleDossiers,
}: SendAllDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [results, setResults] = useState<SendAllResult[] | null>(null);
  const [templates, setTemplates] = useState<TemplateData[]>([]);

  useEffect(() => {
    if (open) {
      setResults(null);

      const template = defaultTemplates[moduleType];
      setSubject(template.subject);
      setBody(template.body);

      getTemplates()
        .then((data) => {
          const filtered = data.filter(
            (t) => t.category === moduleType || t.category === "CUSTOM"
          );
          setTemplates(filtered);
        })
        .catch(() => {});
    }
  }, [open, moduleType]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("L'objet et le message sont requis");
      return;
    }

    if (eligibleDossiers.length === 0) {
      toast.error("Aucun dossier eligible a l'envoi");
      return;
    }

    setIsLoading(true);
    try {
      const actionResults = await sendAllAction({
        moduleType,
        subject: subject.trim(),
        body: body.trim(),
      });

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
      setSubject("");
      setBody("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Envoyer tout - Dossiers {moduleType}
          </DialogTitle>
          <DialogDescription>
            Envoyer un email avec les documents de chaque dossier actif non vide
            a l&apos;adresse de destination configuree dans les parametres.
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
                    <span className="text-sm truncate flex-1">
                      {r.fullName}
                    </span>
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
              <Label>
                Dossiers eligibles ({eligibleDossiers.length})
              </Label>
              <ScrollArea className="h-32 border rounded-md p-2">
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

            {/* Template selector */}
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sendall-template">Modele (optionnel)</Label>
                <Select onValueChange={handleTemplateSelect}>
                  <SelectTrigger id="sendall-template">
                    <SelectValue placeholder="Selectionner un modele" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="sendall-subject">
                Objet <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sendall-subject"
                placeholder="Objet de l'email"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="sendall-body">
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sendall-body"
                placeholder="Corps du message..."
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isLoading}
              />
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
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
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
