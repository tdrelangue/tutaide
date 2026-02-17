"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
  FolderOpen,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { formatRelativeTime, formatFileSize } from "@/lib/utils";
import { uploadDocuments, deleteDocument, getDocuments } from "../document-actions";
import type { DossierWithDocuments } from "../actions";

interface DocumentsTabProps {
  dossier: DossierWithDocuments;
}

type Document = {
  id: string;
  filename: string;
  size: number;
  createdAt: Date;
};

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

export function DocumentsTab({ dossier }: DocumentsTabProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<Document[]>(
    dossier.documents.map((d) => ({ ...d, size: 0 }))
  );
  const [isUploading, setIsUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);

  const doUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} dépasse la limite de 10 Mo`);
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name} : type non supporté (PDF ou image uniquement)`);
        return;
      }
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("dossierId", dossier.id);
      files.forEach((file) => formData.append("files", file));

      const result = await uploadDocuments(formData);
      if (result.success) {
        toast.success(
          `${result.count} document${(result.count ?? 0) > 1 ? "s" : ""} ajouté${
            (result.count ?? 0) > 1 ? "s" : ""
          }`
        );
        const docs = await getDocuments(dossier.id);
        setDocuments(docs);
        setShowUploadZone(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de l'upload");
      }
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [dossier.id, router]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await doUpload(Array.from(files));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await doUpload(files);
    }
  }, [doUpload]);

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      const result = await deleteDocument(deleteId);
      if (result.success) {
        toast.success("Document supprimé");
        setDocuments((prev) => prev.filter((d) => d.id !== deleteId));
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

  const handleDownload = (documentId: string) => {
    window.open(`/api/documents/${documentId}/download`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">
          Documents ({documents.length})
        </h4>
        <Button
          size="sm"
          onClick={() => setShowUploadZone(!showUploadZone)}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : showUploadZone ? (
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {showUploadZone ? "Fermer" : "Ajouter"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-label="Sélectionner des fichiers"
        />
      </div>

      {showUploadZone && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload
            className={`mx-auto h-10 w-10 mb-3 ${
              isDragOver ? "text-primary" : "text-muted-foreground"
            }`}
            aria-hidden="true"
          />
          <p className={`text-sm font-medium ${isDragOver ? "text-primary" : "text-foreground"}`}>
            {isDragOver ? "Déposez vos fichiers ici" : "Glissez-déposez vos fichiers ici"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            PDF, PNG, JPG — max 10 Mo
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            Parcourir les fichiers
          </Button>
        </div>
      )}

      {documents.length === 0 && !showUploadZone && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun document dans ce dossier
        </p>
      )}

      {documents.length > 0 && (
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatRelativeTime(new Date(doc.createdAt))}
                    {doc.size > 0 && ` • ${formatFileSize(doc.size)}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(doc.id)}
                    aria-label={`Télécharger ${doc.filename}`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(doc.id)}
                    aria-label={`Supprimer ${doc.filename}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le document sera définitivement supprimé.
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
