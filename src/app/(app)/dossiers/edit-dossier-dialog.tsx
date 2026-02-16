"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dossierSchema, type DossierFormData } from "@/lib/validations";
import { updateDossier, type DossierWithDocuments } from "./actions";

interface EditDossierDialogProps {
  dossier: DossierWithDocuments;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDossierDialog({ dossier, open, onOpenChange }: EditDossierDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DossierFormData>({
    resolver: zodResolver(dossierSchema),
    defaultValues: {
      fullName: dossier.fullName,
      priority: dossier.priority,
      status: dossier.status,
      notes: dossier.notes || "",
      primaryEmail: dossier.primaryEmail || "",
      ccEmails: dossier.ccEmails,
      bccEmails: dossier.bccEmails,
    },
  });

  const priority = watch("priority");
  const status = watch("status");

  // Reset form when dossier changes
  useEffect(() => {
    reset({
      fullName: dossier.fullName,
      priority: dossier.priority,
      status: dossier.status,
      notes: dossier.notes || "",
      primaryEmail: dossier.primaryEmail || "",
      ccEmails: dossier.ccEmails,
      bccEmails: dossier.bccEmails,
    });
  }, [dossier, reset]);

  async function onSubmit(data: DossierFormData) {
    setIsLoading(true);
    try {
      const result = await updateDossier(dossier.id, data);
      if (result.success) {
        toast.success("Dossier mis à jour");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la mise à jour");
      }
    } catch {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le dossier</DialogTitle>
          <DialogDescription>
            Modifiez les informations du dossier
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-fullName">
              Nom complet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-fullName"
              placeholder="Prénom Nom"
              disabled={isLoading}
              aria-describedby={errors.fullName ? "edit-fullName-error" : undefined}
              aria-invalid={errors.fullName ? "true" : "false"}
              {...register("fullName")}
            />
            {errors.fullName && (
              <p id="edit-fullName-error" className="text-sm text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-priority">Priorité</Label>
              <Select
                value={priority}
                onValueChange={(value) =>
                  setValue("priority", value as DossierFormData["priority"])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="edit-priority">
                  <SelectValue placeholder="Priorité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="PRIORITAIRE">Prioritaire</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">Statut</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setValue("status", value as DossierFormData["status"])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Actif</SelectItem>
                  <SelectItem value="CLOSED">Clôturé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-primaryEmail">Email principal</Label>
            <Input
              id="edit-primaryEmail"
              type="email"
              placeholder="email@example.com"
              disabled={isLoading}
              aria-describedby={errors.primaryEmail ? "edit-primaryEmail-error" : undefined}
              {...register("primaryEmail")}
            />
            {errors.primaryEmail && (
              <p id="edit-primaryEmail-error" className="text-sm text-destructive">
                {errors.primaryEmail.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              placeholder="Notes supplémentaires..."
              disabled={isLoading}
              {...register("notes")}
            />
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
