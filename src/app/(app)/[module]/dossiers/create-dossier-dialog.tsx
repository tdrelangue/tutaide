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
import { Checkbox } from "@/components/ui/checkbox";
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
  moduleType: "APA" | "ASH";
}

export function CreateDossierDialog({
  open,
  onOpenChange,
  moduleType,
}: CreateDossierDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const otherModule = moduleType === "APA" ? "ASH" : "APA";

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
      fullName: "",
      moduleType,
      priority: "NORMAL",
      status: "ACTIVE",
      notes: "",
      primaryEmail: "",
      ccEmails: [],
      bccEmails: [],
      addToOtherModule: false,
    },
  });

  const priority = watch("priority");
  const status = watch("status");
  const addToOtherModule = watch("addToOtherModule");

  async function onSubmit(data: DossierFormData) {
    setIsLoading(true);
    try {
      const result = await createDossier(moduleType, data);
      if (result.success) {
        toast.success("Dossier cree avec succes");
        reset();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la creation");
      }
    } catch {
      toast.error("Erreur lors de la creation");
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
          <DialogTitle>Creer un dossier {moduleType}</DialogTitle>
          <DialogDescription>
            Ajoutez un nouveau dossier pour un protege ({moduleType})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Nom complet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder="Prenom Nom"
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
              <Label htmlFor="priority">Priorite</Label>
              <Select
                value={priority}
                onValueChange={(value) =>
                  setValue("priority", value as DossierFormData["priority"])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Priorite" />
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
                  <SelectItem value="CLOSED">Cloture</SelectItem>
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
              aria-describedby={
                errors.primaryEmail ? "primaryEmail-error" : undefined
              }
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
              placeholder="Notes supplementaires..."
              disabled={isLoading}
              {...register("notes")}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="addToOtherModule"
              checked={addToOtherModule}
              onCheckedChange={(checked) =>
                setValue("addToOtherModule", checked === true)
              }
              disabled={isLoading}
            />
            <Label
              htmlFor="addToOtherModule"
              className="text-sm font-normal cursor-pointer"
            >
              Ajouter aussi a l&apos;{otherModule}
            </Label>
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
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Creer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
