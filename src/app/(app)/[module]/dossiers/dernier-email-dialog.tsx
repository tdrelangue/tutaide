"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendDernierEmail } from "./dernier-actions";
import { type DossierWithDocuments } from "./actions";

// ---------------------------------------------------------------------------
// Validation schema for the dernier email form
// ---------------------------------------------------------------------------

const dernierEmailFormSchema = z.object({
  recipients: z.string().min(1, "Au moins un destinataire requis"),
  subject: z.string().min(1, "L'objet est requis"),
  body: z.string().min(1, "Le contenu est requis"),
});

type DernierEmailFormData = z.infer<typeof dernierEmailFormSchema>;

// ---------------------------------------------------------------------------
// Pre-filled content helpers
// ---------------------------------------------------------------------------

function getSubjectForReason(
  reason: "DECES" | "DESSAISISSEMENT",
  fullName: string
): string {
  if (reason === "DECES") {
    return `Fin de mesure - Deces - ${fullName}`;
  }
  return `Fin de mesure - Dessaisissement - ${fullName}`;
}

function getBodyForReason(
  reason: "DECES" | "DESSAISISSEMENT",
  fullName: string
): string {
  if (reason === "DECES") {
    return [
      "Madame, Monsieur,",
      "",
      `J'ai le regret de vous informer du deces de ${fullName}.`,
      "",
      "Pour cause de deces, je ne serai plus responsable de la gestion de ce dossier.",
      "Certains documents ou elements peuvent etre manquants car l'evenement a eu lieu en cours de mois.",
      "La mesure de protection prend fin de plein droit.",
      "",
      "Cordialement",
    ].join("\n");
  }

  return [
    "Madame, Monsieur,",
    "",
    `Je vous informe du dessaisissement concernant ${fullName}.`,
    "",
    "Pour cause de dessaisissement, je ne serai plus responsable de la gestion de ce dossier.",
    "Certains documents ou elements peuvent etre manquants car l'evenement a eu lieu en cours de mois.",
    "",
    "Cordialement",
  ].join("\n");
}

function getReasonLabel(reason: "DECES" | "DESSAISISSEMENT"): string {
  return reason === "DECES" ? "Deces" : "Dessaisissement";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DernierEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dossier: DossierWithDocuments;
  reason: "DECES" | "DESSAISISSEMENT";
  moduleType: "APA" | "ASH";
}

export function DernierEmailDialog({
  open,
  onOpenChange,
  dossier,
  reason,
  moduleType,
}: DernierEmailDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DernierEmailFormData>({
    resolver: zodResolver(dernierEmailFormSchema),
    defaultValues: {
      recipients: dossier.primaryEmail || "",
      subject: getSubjectForReason(reason, dossier.fullName),
      body: getBodyForReason(reason, dossier.fullName),
    },
  });

  // Reset the form whenever the dialog opens or the reason / dossier changes
  useEffect(() => {
    if (open) {
      reset({
        recipients: dossier.primaryEmail || "",
        subject: getSubjectForReason(reason, dossier.fullName),
        body: getBodyForReason(reason, dossier.fullName),
      });
    }
  }, [open, reason, dossier, reset]);

  async function onSubmit(data: DernierEmailFormData) {
    setIsLoading(true);
    try {
      // Parse comma-separated recipients into an array
      const recipientsList = data.recipients
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (recipientsList.length === 0) {
        toast.error("Veuillez saisir au moins un destinataire");
        setIsLoading(false);
        return;
      }

      const result = await sendDernierEmail({
        dossierId: dossier.id,
        moduleType,
        reason,
        recipients: recipientsList,
        subject: data.subject,
        body: data.body,
      });

      if (result.success) {
        // sendDernierEmail already closes the dossier
        toast.success(
          `Dernier email envoye et dossier cloture (${getReasonLabel(reason)})`
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de l'envoi du dernier email");
      }
    } catch {
      toast.error("Erreur lors de l'envoi du dernier email");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Dernier email - {getReasonLabel(reason)}
          </DialogTitle>
          <DialogDescription>
            Envoyez le dernier email pour le dossier de {dossier.fullName}.
            Le dossier sera automatiquement cloture apres l&apos;envoi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Recipients */}
          <div className="space-y-2">
            <Label htmlFor="dernier-recipients">
              Destinataires <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dernier-recipients"
              placeholder="email1@example.com, email2@example.com"
              disabled={isLoading}
              aria-describedby={
                errors.recipients ? "dernier-recipients-error" : undefined
              }
              aria-invalid={errors.recipients ? "true" : "false"}
              {...register("recipients")}
            />
            {errors.recipients && (
              <p
                id="dernier-recipients-error"
                className="text-sm text-destructive"
              >
                {errors.recipients.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Separez les adresses par des virgules
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="dernier-subject">
              Objet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dernier-subject"
              placeholder="Objet de l'email"
              disabled={isLoading}
              aria-describedby={
                errors.subject ? "dernier-subject-error" : undefined
              }
              aria-invalid={errors.subject ? "true" : "false"}
              {...register("subject")}
            />
            {errors.subject && (
              <p
                id="dernier-subject-error"
                className="text-sm text-destructive"
              >
                {errors.subject.message}
              </p>
            )}
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="dernier-body">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dernier-body"
              placeholder="Corps du message..."
              rows={10}
              disabled={isLoading}
              aria-describedby={
                errors.body ? "dernier-body-error" : undefined
              }
              aria-invalid={errors.body ? "true" : "false"}
              {...register("body")}
            />
            {errors.body && (
              <p id="dernier-body-error" className="text-sm text-destructive">
                {errors.body.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Envoyer et cloturer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
