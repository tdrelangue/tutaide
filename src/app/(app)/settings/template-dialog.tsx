"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
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
import { emailTemplateSchema, type EmailTemplateFormData } from "@/lib/validations";
import { createTemplate, updateTemplate, type TemplateData } from "./actions";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateData | null;
  onComplete?: (template?: TemplateData) => void;
  defaultCategory?: "APA" | "ASH" | "DERNIER_DECES" | "DERNIER_DESSAISISSEMENT" | "CUSTOM";
}

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  onComplete,
  defaultCategory = "APA",
}: TemplateDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!template;
  const isGlobal = template?.isGlobal ?? false;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EmailTemplateFormData>({
    resolver: zodResolver(emailTemplateSchema),
    defaultValues: {
      name: "",
      subject: "",
      body: "",
      category: defaultCategory,
      isDefault: false,
    },
  });

  const category = watch("category");
  const isDefault = watch("isDefault");

  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        subject: template.subject,
        body: template.body,
        category: template.category,
        isDefault: template.isDefault,
      });
    } else {
      reset({
        name: "",
        subject: "",
        body: "",
        category: defaultCategory,
        isDefault: false,
      });
    }
  }, [template, reset, open, defaultCategory]);

  async function onSubmit(data: EmailTemplateFormData) {
    setIsLoading(true);
    try {
      if (isEditing && template) {
        if (isGlobal) {
          // Check if anything actually changed
          const unchanged =
            data.name === template.name &&
            data.subject === template.subject &&
            data.body === template.body &&
            data.category === template.category &&
            data.isDefault === template.isDefault;

          if (unchanged) {
            onOpenChange(false);
            return;
          }

          // Create a personal copy with the user's changes
          const result = await createTemplate(data);
          if (result.success && result.id) {
            toast.success("Copie personnelle créée avec vos modifications");
            onComplete?.({ id: result.id, isGlobal: false, ...data });
            onOpenChange(false);
          } else {
            toast.error(result.error || "Erreur lors de la création");
          }
        } else {
          const result = await updateTemplate(template.id, data);
          if (result.success) {
            toast.success("Modèle mis à jour");
            onComplete?.({ id: template.id, isGlobal: false, ...data });
            onOpenChange(false);
          } else {
            toast.error(result.error || "Erreur lors de la mise à jour");
          }
        }
      } else {
        const result = await createTemplate(data);
        if (result.success && result.id) {
          toast.success("Modèle créé");
          onComplete?.({ id: result.id, isGlobal: false, ...data });
          onOpenChange(false);
        } else {
          toast.error(result.error || "Erreur lors de la création");
        }
      }
    } catch {
      toast.error("Une erreur est survenue");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Modifier le modèle" : "Nouveau modèle"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifiez les informations du modèle d'email"
              : "Créez un nouveau modèle d'email réutilisable"}
          </DialogDescription>
        </DialogHeader>

        {isGlobal && (
          <div className="flex items-start gap-2 rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Modèle partagé — vos modifications créeront une copie personnelle.</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">
              Nom du modèle <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              placeholder="Ex: Rapport trimestriel"
              disabled={isLoading}
              aria-describedby={errors.name ? "template-name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="template-name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-category">Catégorie</Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setValue("category", value as EmailTemplateFormData["category"])
              }
              disabled={isLoading}
            >
              <SelectTrigger id="template-category">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APA">APA</SelectItem>
                <SelectItem value="ASH">ASH</SelectItem>
                <SelectItem value="DERNIER_DECES">Dernier email - Décès</SelectItem>
                <SelectItem value="DERNIER_DESSAISISSEMENT">Dernier email - Dessaisissement</SelectItem>
                <SelectItem value="CUSTOM">Personnalisé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-subject">
              Objet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-subject"
              placeholder="Objet de l'email"
              disabled={isLoading}
              aria-describedby={errors.subject ? "template-subject-error" : undefined}
              {...register("subject")}
            />
            {errors.subject && (
              <p id="template-subject-error" className="text-sm text-destructive">
                {errors.subject.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-body">
              Contenu <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="template-body"
              placeholder="Corps de l'email..."
              rows={6}
              disabled={isLoading}
              aria-describedby={errors.body ? "template-body-error" : undefined}
              {...register("body")}
            />
            {errors.body && (
              <p id="template-body-error" className="text-sm text-destructive">
                {errors.body.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Variables : {"{{nom_protege}}"}, {"{{trimestre}}"}, {"{{annee}}"}, {"{{mois}}"}, {"{{signature}}"}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="template-isDefault"
              checked={isDefault}
              onCheckedChange={(checked) => setValue("isDefault", checked as boolean)}
              disabled={isLoading || isGlobal}
            />
            <Label
              htmlFor="template-isDefault"
              className={isGlobal ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
            >
              Définir comme modèle par défaut
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isEditing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
