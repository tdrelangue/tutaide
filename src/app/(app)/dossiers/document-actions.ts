"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getDocumentsBaseDir } from "@/lib/documents-dir";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

function isAllowedFile(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE;
}

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

    const dossier = await db.dossier.findFirst({
      where: { id: dossierId, userId },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouvé" };
    }

    const uploadedDocs = [];
    const dir = path.join(getDocumentsBaseDir(), userId, dossierId);
    await fs.mkdir(dir, { recursive: true });

    for (const file of files) {
      if (!isAllowedFile(file)) {
        continue;
      }

      const timestamp = Date.now();
      const safeFilename = `${timestamp}-${file.name}`;
      const filePath = path.join(dir, safeFilename);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      const doc = await db.document.create({
        data: {
          filename: file.name,
          blobUrl: filePath,
          size: file.size,
          mimeType: file.type,
          userId,
          dossierId,
        },
      });

      uploadedDocs.push(doc);
    }

    if (uploadedDocs.length === 0) {
      return { success: false, error: "Aucun fichier valide (PDF ou image, max 10 Mo)" };
    }

    revalidatePath("/dossiers");
    revalidatePath("/apa/dossiers");
    revalidatePath("/ash/dossiers");
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

    const document = await db.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      return { success: false, error: "Document non trouvé" };
    }

    try {
      await fs.unlink(document.blobUrl);
    } catch {
      console.error("Failed to delete local file:", document.blobUrl);
    }

    await db.document.delete({
      where: { id: documentId },
    });

    revalidatePath("/dossiers");
    revalidatePath("/apa/dossiers");
    revalidatePath("/ash/dossiers");
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

  return `/api/documents/${documentId}/download`;
}
