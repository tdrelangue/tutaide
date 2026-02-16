"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function uploadDocuments(formData: FormData): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const userId = await requireAuth();
    const dossierId = formData.get("dossierId") as string;
    const files = formData.getAll("files") as File[];

    if (!dossierId || files.length === 0) {
      return { success: false, error: "Données manquantes" };
    }

    // Verify dossier ownership
    const dossier = await db.dossier.findFirst({
      where: { id: dossierId, userId },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouvé" };
    }

    // Upload each file to Vercel Blob
    const uploadedDocs = [];
    for (const file of files) {
      // Validate file type
      if (file.type !== "application/pdf") {
        continue; // Skip non-PDF files
      }

      // Upload to Vercel Blob
      const blob = await put(`documents/${userId}/${dossierId}/${file.name}`, file, {
        access: "public", // We'll control access via our API route
        addRandomSuffix: true,
      });

      // Create document record
      const doc = await db.document.create({
        data: {
          filename: file.name,
          blobUrl: blob.url,
          size: file.size,
          mimeType: file.type,
          userId,
          dossierId,
        },
      });

      uploadedDocs.push(doc);
    }

    if (uploadedDocs.length === 0) {
      return { success: false, error: "Aucun fichier PDF valide" };
    }

    revalidatePath("/dossiers");
    return { success: true, count: uploadedDocs.length };
  } catch (error) {
    console.error("Error uploading documents:", error);
    return { success: false, error: "Erreur lors de l'upload" };
  }
}

export async function deleteDocument(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const userId = await requireAuth();

    // Find document and verify ownership
    const document = await db.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      return { success: false, error: "Document non trouvé" };
    }

    // Delete from Vercel Blob
    try {
      await del(document.blobUrl);
    } catch {
      // Continue even if blob deletion fails
      console.error("Failed to delete blob:", document.blobUrl);
    }

    // Delete from database
    await db.document.delete({
      where: { id: documentId },
    });

    revalidatePath("/dossiers");
    return { success: true };
  } catch (error) {
    console.error("Error deleting document:", error);
    return { success: false, error: "Erreur lors de la suppression" };
  }
}

export async function getDocuments(dossierId: string): Promise<
  Array<{
    id: string;
    filename: string;
    size: number;
    createdAt: Date;
  }>
> {
  const userId = await requireAuth();

  const documents = await db.document.findMany({
    where: { dossierId, userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      size: true,
      createdAt: true,
    },
  });

  return documents;
}

export async function getDocumentUrl(documentId: string): Promise<string | null> {
  const userId = await requireAuth();

  const document = await db.document.findFirst({
    where: { id: documentId, userId },
  });

  if (!document) {
    return null;
  }

  return document.blobUrl;
}
