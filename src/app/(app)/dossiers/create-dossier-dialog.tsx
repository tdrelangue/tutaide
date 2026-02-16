"use client";

import { useState } from "react";
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
import { createDossier } from "./actions";

interface CreateDossierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDossierDialog({ open, onOpenChange }: CreateDossierDialogProps) {
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
      priority: "NORMAL",
      status: "ACTIVE",
      ccEmails: [],
      bccEmails: [],
    },
  });

  const priority = watch("priority");
  const status = watch("status");

  async function onSubmit(data: DossierFormData) {
    setIsLoading(true);
    try {
      const result = await createDossier(data);
      if (result.success) {
        toast.success("Dossier créé avec succès");
        reset();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la création");
      }
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setIsLoading(false);
    }
  }

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un dossier</DialogTitle>
          <DialogDescription>
            Ajoutez un nouveau dossier pour un protégé
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Nom complet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder="Prénom Nom"
              disabled={isLoading}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              aria-invalid={errors.fullName ? "true" : "false"}
              {...register("fullName")}
            />
            {errors.fullName && (
              <p id="fullName-error" className="text-sm text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priorité</Label>
              <Select
                value={priority}
                onValueChange={(value) =>
                  setValue("priority", value as DossierFormData["priority"])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="priority">
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
              <Label htmlFor="status">Statut</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setValue("status", value as DossierFormData["status"])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="status">
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
            <Label htmlFor="primaryEmail">Email principal</Label>
            <Input
              id="primaryEmail"
              type="email"
              placeholder="email@example.com"
              disabled={isLoading}
              aria-describedby={errors.primaryEmail ? "primaryEmail-error" : undefined}
              {...register("primaryEmail")}
            />
            {errors.primaryEmail && (
              <p id="primaryEmail-error" className="text-sm text-destructive">
                {errors.primaryEmail.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Notes supplémentaires..."
              disabled={isLoading}
              {...register("notes")}
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
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
