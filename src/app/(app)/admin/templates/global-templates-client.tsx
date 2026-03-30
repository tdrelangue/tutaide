"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  createGlobalTemplate,
  updateGlobalTemplate,
  deleteGlobalTemplate,
  type GlobalTemplateData,
} from "../actions";

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

type TemplateCategory = "APA" | "ASH" | "DERNIER_DECES" | "DERNIER_DESSAISISSEMENT" | "CUSTOM";

interface GlobalTemplateFormValues {
  name: string;
  subject: string;
  body: string;
  category: TemplateCategory;
  isDefault: boolean;
}

interface GlobalTemplatesClientProps {
  initialTemplates: GlobalTemplateData[];
}

export function GlobalTemplatesClient({ initialTemplates }: GlobalTemplatesClientProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GlobalTemplateData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const handleEdit = (template: GlobalTemplateData) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const result = await deleteGlobalTemplate(deleteId);
      if (result.success) {
        toast.success("Modèle supprimé");
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId));
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

  const handleDialogComplete = (updated: GlobalTemplateData) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    router.refresh();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/users" aria-label="Retour aux utilisateurs">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <FileText className="h-5 w-5 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Modèles globaux</h2>
              <p className="text-sm text-muted-foreground">
                {templates.length} modèle{templates.length > 1 ? "s" : ""} partagé{templates.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau modèle
          </Button>
        </div>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-auto p-6">
        {templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Aucun modèle global</p>
            <Button variant="link" onClick={handleCreate}>Créer le premier modèle</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{template.name}</h4>
                    <Badge variant={categoryVariants[template.category]}>
                      {categoryLabels[template.category]}
                    </Badge>
                    {template.isDefault && (
                      <Badge variant="default">Par défaut</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {template.subject}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(template)}
                    aria-label={`Modifier ${template.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(template.id)}
                    aria-label={`Supprimer ${template.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GlobalTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editingTemplate}
        onComplete={handleDialogComplete}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le modèle global ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les utilisateurs qui utilisaient ce modèle
              n&apos;auront plus de modèle par défaut assigné.
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
    </div>
  );
}

function GlobalTemplateDialog({
  open,
  onOpenChange,
  template,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: GlobalTemplateData | null;
  onComplete: (t: GlobalTemplateData) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!template;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<GlobalTemplateFormValues>({
      defaultValues: {
        name: "",
        subject: "",
        body: "",
        category: "APA",
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
      reset({ name: "", subject: "", body: "", category: "APA", isDefault: false });
    }
  }, [template, open, reset]);

  async function onSubmit(data: GlobalTemplateFormValues) {
    setIsLoading(true);
    try {
      if (isEditing && template) {
        const result = await updateGlobalTemplate(template.id, data);
        if (result.success) {
          toast.success("Modèle mis à jour");
          onComplete({ ...template, ...data });
          onOpenChange(false);
        } else {
          toast.error(result.error || "Erreur");
        }
      } else {
        const result = await createGlobalTemplate(data);
        if (result.success && result.id) {
          toast.success("Modèle créé");
          onComplete({ id: result.id, ...data });
          onOpenChange(false);
          reset();
        } else {
          toast.error(result.error || "Erreur");
        }
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifier le modèle global" : "Nouveau modèle global"}</DialogTitle>
          <DialogDescription>
            Ce modèle sera visible par tous les utilisateurs
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gtpl-name">Nom <span className="text-destructive">*</span></Label>
            <Input id="gtpl-name" placeholder="Ex: APA Trimestriel" disabled={isLoading} {...register("name", { required: true })} />
            {errors.name && <p className="text-sm text-destructive">Nom requis</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gtpl-category">Catégorie</Label>
            <Select value={category} onValueChange={(v) => setValue("category", v as TemplateCategory)} disabled={isLoading}>
              <SelectTrigger id="gtpl-category"><SelectValue /></SelectTrigger>
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
            <Label htmlFor="gtpl-subject">Objet <span className="text-destructive">*</span></Label>
            <Input id="gtpl-subject" placeholder="Objet de l'email" disabled={isLoading} {...register("subject", { required: true })} />
            {errors.subject && <p className="text-sm text-destructive">Objet requis</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gtpl-body">Contenu <span className="text-destructive">*</span></Label>
            <Textarea id="gtpl-body" rows={6} disabled={isLoading} {...register("body", { required: true })} />
            {errors.body && <p className="text-sm text-destructive">Contenu requis</p>}
            <p className="text-xs text-muted-foreground">
              Variables disponibles : {"{{nom}}"}, {"{{trimestre}}"}, {"{{annee}}"}, {"{{mois}}"}, {"{{signature}}"}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="gtpl-isDefault"
              checked={isDefault}
              onCheckedChange={(v) => setValue("isDefault", v === true)}
              disabled={isLoading}
            />
            <Label htmlFor="gtpl-isDefault" className="cursor-pointer">Modèle par défaut pour cette catégorie</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={isLoading}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
