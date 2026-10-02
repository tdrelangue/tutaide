"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Mail, Pencil, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentsTab } from "./tabs/documents-tab";
import { EmailsTab } from "./tabs/emails-tab";
import { InfoTab } from "./tabs/info-tab";
import { EditDossierDialog } from "./edit-dossier-dialog";
import { DernierEmailDialog } from "./dernier-email-dialog";
import {
  deleteDossier,
  getGroupMembers,
  type DossierWithDocuments,
  type GroupMember,
} from "./actions";

interface DossierSheetProps {
  dossier: DossierWithDocuments | null;
  open: boolean;
  onClose: () => void;
  moduleType: "APA" | "ASH" | "PCH";
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
  CLOSED: "Cloture",
};

const statusVariants = {
  ACTIVE: "active",
  CLOSED: "closed",
} as const;

const moduleVariants = {
  APA: "outline",
  ASH: "outline",
  PCH: "outline",
} as const;

export function DossierSheet({
  dossier,
  open,
  onClose,
  moduleType,
}: DossierSheetProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"one" | "group">("one");
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [dernierEmailReason, setDernierEmailReason] = useState<
    "DECES" | "DESSAISISSEMENT" | null
  >(null);

  useEffect(() => {
    if (!dossier) {
      setGroupMembers([]);
      return;
    }
    getGroupMembers(dossier.id).then(setGroupMembers).catch(() => setGroupMembers([]));
  }, [dossier]);

  useEffect(() => {
    if (isDeleteOpen) setDeleteScope("one");
  }, [isDeleteOpen]);

  if (!dossier) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteDossier(dossier.id, deleteScope);
      if (result.success) {
        toast.success(
          deleteScope === "group" ? "Dossiers lies supprimes" : "Dossier supprime"
        );
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
              <SheetTitle className="text-xl">Details Dossier</SheetTitle>
              <SheetDescription className="sr-only">
                Informations detaillees sur le dossier de {dossier.fullName}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3">
              <h3 className="text-lg font-semibold">{dossier.fullName}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant={moduleVariants[moduleType]}>
                  {moduleType}
                </Badge>
                <Badge variant={priorityVariants[dossier.priority]}>
                  {priorityLabels[dossier.priority]}
                </Badge>
                <Badge variant={statusVariants[dossier.status]}>
                  {statusLabels[dossier.status]}
                </Badge>
              </div>
              {groupMembers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Lie au{groupMembers.length > 1 ? "x dossiers" : " dossier"}{" "}
                  {groupMembers.map((m) => m.moduleType).join(", ")}
                </p>
              )}
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
                {/* EmailsTab/SendEmailDialog predate PCH support and are typed APA|ASH only;
                    the value still passes through correctly, only pre-existing narrowness. */}
                <EmailsTab dossierId={dossier.id} moduleType={moduleType as "APA" | "ASH"} />
              </TabsContent>
              <TabsContent value="info" className="mt-4">
                <InfoTab dossier={dossier} groupMembers={groupMembers} />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Dernier email
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDernierEmailReason("DECES")}>
                  Deces
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDernierEmailReason("DESSAISISSEMENT")}>
                  Dessaisissement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Dernier Email Dialog */}
      {dernierEmailReason && (
        <DernierEmailDialog
          open={!!dernierEmailReason}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDernierEmailReason(null);
          }}
          dossier={dossier}
          reason={dernierEmailReason}
          moduleType={moduleType}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. Le dossier de{" "}
              <strong>{dossier.fullName}</strong> et tous ses documents seront
              definitivement supprimes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {groupMembers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Que souhaitez-vous supprimer ?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={deleteScope === "one" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDeleteScope("one")}
                  disabled={isDeleting}
                >
                  Ce dossier ({moduleType}) uniquement
                </Button>
                <Button
                  type="button"
                  variant={deleteScope === "group" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDeleteScope("group")}
                  disabled={isDeleting}
                >
                  Tous les dossiers lies (
                  {[moduleType, ...groupMembers.map((m) => m.moduleType)].join(", ")})
                </Button>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
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
