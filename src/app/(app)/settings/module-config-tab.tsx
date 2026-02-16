"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TemplateDialog } from "./template-dialog";
import {
  saveModuleConfig,
  deleteTemplate,
  type ModuleConfigData,
  type TemplateData,
} from "./actions";
import type { ModuleType } from "@prisma/client";

const emailSchema = z.object({
  destinationEmail: z.string().email("Email invalide"),
});

type EmailFormData = z.infer<typeof emailSchema>;

interface ModuleConfigTabProps {
  moduleType: ModuleType;
  moduleLabel: string;
  moduleColor: "blue" | "emerald";
  initialConfig: ModuleConfigData;
  initialTemplates: TemplateData[];
  onTemplatesChange: (templates: TemplateData[]) => void;
}

export function ModuleConfigTab({
  moduleType,
  moduleLabel,
  moduleColor,
  initialConfig,
  initialTemplates,
  onTemplatesChange,
}: ModuleConfigTabProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const colorClasses = {
    blue: {
      badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      indicator: "bg-blue-600",
    },
    emerald: {
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      indicator: "bg-emerald-600",
    },
  };

  const styles = colorClasses[moduleColor];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      destinationEmail: initialConfig?.destinationEmail || "",
    },
  });

  async function onSubmitEmail(data: EmailFormData) {
    setIsSaving(true);
    try {
      const result = await saveModuleConfig(moduleType, data.destinationEmail);
      if (result.success) {
        toast.success("Email de destination enregistre");
      } else {
        toast.error(result.error || "Erreur lors de l'enregistrement");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditTemplate(template: TemplateData) {
    setEditingTemplate(template);
    setTemplateDialogOpen(true);
  }

  function handleNewTemplate() {
    setEditingTemplate(null);
    setTemplateDialogOpen(true);
  }

  async function handleDeleteTemplate(id: string) {
    setDeletingId(id);
    try {
      const result = await deleteTemplate(id);
      if (result.success) {
        toast.success("Modele supprime");
        onTemplatesChange(initialTemplates.filter((t) => t.id !== id));
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setDeletingId(null);
    }
  }

  function handleTemplateComplete(template?: TemplateData) {
    if (template) {
      const existingIndex = initialTemplates.findIndex((t) => t.id === template.id);
      if (existingIndex >= 0) {
        const updated = [...initialTemplates];
        updated[existingIndex] = template;
        onTemplatesChange(updated);
      } else {
        onTemplatesChange([template, ...initialTemplates]);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-semibold",
            styles.badge
          )}
        >
          <span
            className={cn("h-2 w-2 rounded-full", styles.indicator)}
            aria-hidden="true"
          />
          {moduleType}
        </span>
        <span className="text-muted-foreground text-sm">{moduleLabel}</span>
      </div>

      {/* Destination Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email de destination
          </CardTitle>
          <CardDescription>
            Adresse email ou seront envoyes les emails de ce module
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitEmail)} className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor={`${moduleType}-email`} className="sr-only">
                Email de destination
              </Label>
              <Input
                id={`${moduleType}-email`}
                type="email"
                placeholder="destination@exemple.fr"
                disabled={isSaving}
                {...register("destinationEmail")}
              />
              {errors.destinationEmail && (
                <p className="text-sm text-destructive mt-1">
                  {errors.destinationEmail.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Modeles d&apos;email</CardTitle>
              <CardDescription>
                Modeles d&apos;email pour le module {moduleType}
              </CardDescription>
            </div>
            <Button onClick={handleNewTemplate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nouveau modele
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {initialTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aucun modele pour ce module</p>
              <p className="text-sm mt-1">
                Creez votre premier modele d&apos;email
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {initialTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{template.name}</span>
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          Par defaut
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {template.subject}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditTemplate(template)}
                      aria-label="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTemplate(template.id)}
                      disabled={deletingId === template.id}
                      aria-label="Supprimer"
                    >
                      {deletingId === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editingTemplate}
        onComplete={handleTemplateComplete}
        defaultCategory={moduleType}
      />
    </div>
  );
}
