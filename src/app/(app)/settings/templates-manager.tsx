"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TemplateDialog } from "./template-dialog";
import { deleteTemplate, duplicateTemplate, type TemplateData } from "./actions";

interface TemplatesManagerProps {
  templates: TemplateData[];
  onTemplatesChange: (templates: TemplateData[]) => void;
}

const categoryLabels: Record<string, string> = {
  APA: "APA",
  ASH: "ASH",
  DERNIER_DECES: "Dernier email - Décès",
  DERNIER_DESSAISISSEMENT: "Dernier email - Dessaisissement",
  CUSTOM: "Personnalisé",
};

const categoryVariants: Record<string, "secondary" | "outline" | "default"> = {
  APA: "secondary",
  ASH: "secondary",
  DERNIER_DECES: "outline",
  DERNIER_DESSAISISSEMENT: "outline",
  CUSTOM: "outline",
};

export function TemplatesManager({ templates, onTemplatesChange }: TemplatesManagerProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  const handleDuplicate = async (template: TemplateData) => {
    setIsDuplicating(template.id);
    try {
      const result = await duplicateTemplate(template.id);
      if (result.success && result.newId) {
        toast.success("Modèle dupliqué — vous pouvez maintenant le modifier");
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la duplication");
      }
    } catch {
      toast.error("Erreur lors de la duplication");
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (template: TemplateData) => {
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      const result = await deleteTemplate(deleteId);
      if (result.success) {
        toast.success("Modèle supprimé");
        onTemplatesChange(templates.filter((t) => t.id !== deleteId));
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const handleDialogComplete = (newTemplate?: TemplateData) => {
    setIsDialogOpen(false);
    if (newTemplate) {
      if (editingTemplate) {
        // Update existing
        onTemplatesChange(
          templates.map((t) => (t.id === newTemplate.id ? newTemplate : t))
        );
      } else {
        // Add new
        onTemplatesChange([newTemplate, ...templates]);
      }
    }
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Modèles d&apos;emails</CardTitle>
            <CardDescription>
              Créez et gérez vos modèles d&apos;emails réutilisables
            </CardDescription>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nouveau modèle
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Aucun modèle créé</p>
            <Button variant="link" onClick={handleCreate}>
              Créer votre premier modèle
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{template.name}</h4>
                    <Badge variant={categoryVariants[template.category]}>
                      {categoryLabels[template.category]}
                    </Badge>
                    {template.isGlobal && (
                      <Badge variant="outline" className="text-xs">Global</Badge>
                    )}
                    {template.isDefault && (
                      <Badge variant="default">Par défaut</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {template.subject}
                  </p>
                </div>
                <div className="flex gap-1">
                  {template.isGlobal ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDuplicate(template)}
                      disabled={isDuplicating === template.id}
                      aria-label={`Dupliquer ${template.name}`}
                      title="Dupliquer pour modifier"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(template)}
                        aria-label={`Modifier ${template.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(template.id)}
                        aria-label={`Supprimer ${template.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Template Dialog */}
      <TemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        template={editingTemplate}
        onComplete={handleDialogComplete}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le modèle sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
