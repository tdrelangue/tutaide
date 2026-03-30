"use client";

import { useState, useEffect } from "react";
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

  // Reset form when template changes
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
        const result = await updateTemplate(template.id, data);
        if (result.success) {
          toast.success("Modele mis a jour");
          onComplete?.({
            id: template.id,
            isGlobal: template.isGlobal,
            ...data,
          });
          onOpenChange(false);
        } else {
          toast.error(result.error || "Erreur lors de la mise a jour");
        }
      } else {
        const result = await createTemplate(data);
        if (result.success && result.id) {
          toast.success("Modele cree");
          onComplete?.({
            id: result.id,
            isGlobal: false,
            ...data,
          });
          onOpenChange(false);
        } else {
          toast.error(result.error || "Erreur lors de la creation");
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
            {isEditing ? "Modifier le modele" : "Nouveau modele"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifiez les informations du modele d'email"
              : "Creez un nouveau modele d'email reutilisable"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">
              Nom du modele <span className="text-destructive">*</span>
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
            <Label htmlFor="template-category">Categorie</Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setValue("category", value as EmailTemplateFormData["category"])
              }
              disabled={isLoading}
            >
              <SelectTrigger id="template-category">
                <SelectValue placeholder="Selectionner une categorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APA">APA</SelectItem>
                <SelectItem value="ASH">ASH</SelectItem>
                <SelectItem value="DERNIER_DECES">Dernier email - Deces</SelectItem>
                <SelectItem value="DERNIER_DESSAISISSEMENT">Dernier email - Dessaisissement</SelectItem>
                <SelectItem value="CUSTOM">Personnalise</SelectItem>
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
              Vous pouvez utiliser des variables : {"{{nom}}"}, {"{{date}}"}, etc.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="template-isDefault"
              checked={isDefault}
              onCheckedChange={(checked) => setValue("isDefault", checked as boolean)}
              disabled={isLoading}
            />
            <Label htmlFor="template-isDefault" className="cursor-pointer">
              Definir comme modele par defaut
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
              {isEditing ? "Enregistrer" : "Creer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
