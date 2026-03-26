"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Separator } from "@/components/ui/separator";
import { DocumentsTab } from "./tabs/documents-tab";
import { EmailsTab } from "./tabs/emails-tab";
import { InfoTab } from "./tabs/info-tab";
import { EditDossierDialog } from "./edit-dossier-dialog";
import { deleteDossier, type DossierWithDocuments } from "./actions";

interface DossierSheetProps {
  dossier: DossierWithDocuments | null;
  open: boolean;
  onClose: () => void;
}

const priorityLabels = {
  NORMAL: "Normal",
  PRIORITAIRE: "Prioritaire",
  URGENT: "Urgent",
};

const priorityVariants = {
  NORMAL: "normal",
  PRIORITAIRE: "prioritaire",
  URGENT: "urgent",
} as const;

const statusLabels = {
  ACTIVE: "Actif",
  CLOSED: "Clôturé",
};

const statusVariants = {
  ACTIVE: "active",
  CLOSED: "closed",
} as const;

export function DossierSheet({ dossier, open, onClose }: DossierSheetProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!dossier) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteDossier(dossier.id);
      if (result.success) {
        toast.success("Dossier supprimé");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
          {/* Fixed header */}
          <div className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetHeader className="space-y-1">
              <SheetTitle className="text-xl">Détails Dossier</SheetTitle>
              <SheetDescription className="sr-only">
                Informations détaillées sur le dossier de {dossier.fullName}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3">
              <h3 className="text-lg font-semibold">{dossier.fullName}</h3>
              <div className="flex gap-2 mt-2">
                <Badge variant={priorityVariants[dossier.priority]}>
                  {priorityLabels[dossier.priority]}
                </Badge>
                <Badge variant={statusVariants[dossier.status]}>
                  {statusLabels[dossier.status]}
                </Badge>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs defaultValue="documents" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="documents" className="flex-1">
                  Documents
                </TabsTrigger>
                <TabsTrigger value="emails" className="flex-1">
                  Emails
                </TabsTrigger>
                <TabsTrigger value="info" className="flex-1">
                  Notes/Info
                </TabsTrigger>
              </TabsList>
              <TabsContent value="documents" className="mt-4">
                <DocumentsTab dossier={dossier} />
              </TabsContent>
              <TabsContent value="emails" className="mt-4">
                <EmailsTab dossierId={dossier.id} />
              </TabsContent>
              <TabsContent value="info" className="mt-4">
                <InfoTab dossier={dossier} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky bottom actions */}
          <div className="px-6 py-4 border-t shrink-0 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Modifier
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Supprimer
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <EditDossierDialog
        dossier={dossier}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le dossier de{" "}
              <strong>{dossier.fullName}</strong> et tous ses documents seront
              définitivement supprimés.
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
    </>
  );
}
