"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

/**
 * Absolute path to the uploads directory at the project root (next to `src/`).
 * Uses `process.cwd()` which in Next.js resolves to the project root.
 */
function getUploadsRoot(): string {
  return path.join(process.cwd(), "uploads");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateModulePaths(): void {
  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");
}

function isAllowedFile(file: File): boolean {
  const ext = path.extname(file.name).toLowerCase();
  return (
    ALLOWED_MIME_TYPES.has(file.type) &&
    ALLOWED_EXTENSIONS.has(ext) &&
    file.size <= MAX_FILE_SIZE
  );
}

/**
 * Build a unique filename by prepending a timestamp to the original name.
 * This avoids collisions when the same file is uploaded multiple times.
 */
function buildUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const timestamp = Date.now();
  // Sanitise the base name: keep only alphanumeric, dash, underscore, dot
  const safeName = base.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  return `${timestamp}-${safeName}${ext}`;
}

/**
 * Ensure a directory exists, creating it (and parents) if necessary.
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Public server actions
// ---------------------------------------------------------------------------

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
      return { success: false, error: "Donnees manquantes" };
    }

    // Verify dossier ownership
    const dossier = await db.dossier.findFirst({
      where: { id: dossierId, userId },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouve" };
    }

    // Prepare the target directory: uploads/{userId}/{dossierId}/
    const uploadDir = path.join(getUploadsRoot(), userId, dossierId);
    await ensureDir(uploadDir);

    const uploadedDocs: Array<{ id: string }> = [];

    for (const file of files) {
      // Validate file type and size
      if (!isAllowedFile(file)) {
        continue; // Skip files that do not match criteria
      }

      const uniqueFilename = buildUniqueFilename(file.name);
      const filePath = path.join(uploadDir, uniqueFilename);

      // Read file contents and write to disk
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(filePath, buffer);

      // Create the database record.
      // The blobUrl is stored as a virtual API path that a download route
      // will resolve. The actual file path on disk is derived from the
      // document id at download time.
      const doc = await db.document.create({
        data: {
          filename: file.name,
          blobUrl: "", // placeholder -- updated below with the document id
          size: file.size,
          mimeType: file.type,
          userId,
          dossierId,
        },
      });

      // Now that we have the document id, set the canonical download URL
      // and persist the disk-relative path so we can locate the file later.
      const downloadUrl = `/api/documents/${doc.id}/download`;

      await db.document.update({
        where: { id: doc.id },
        data: {
          blobUrl: downloadUrl,
        },
      });

      // Store a mapping file so the download endpoint can find the
      // physical file. We use a simple sidecar JSON file.
      const metaPath = path.join(uploadDir, `${doc.id}.meta.json`);
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          diskFilename: uniqueFilename,
          originalFilename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
        "utf-8"
      );

      uploadedDocs.push({ id: doc.id });
    }

    if (uploadedDocs.length === 0) {
      return {
        success: false,
        error: "Aucun fichier valide (PDF ou image, max 10 Mo)",
      };
    }

    revalidateModulePaths();
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
      return { success: false, error: "Document non trouve" };
    }

    // Attempt to delete the physical file and its metadata from disk
    const uploadDir = path.join(
      getUploadsRoot(),
      userId,
      document.dossierId
    );

    const metaPath = path.join(uploadDir, `${documentId}.meta.json`);

    try {
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaRaw) as { diskFilename: string };
      const filePath = path.join(uploadDir, meta.diskFilename);

      await fs.unlink(filePath).catch(() => {
        console.error("Failed to delete file from disk:", filePath);
      });

      await fs.unlink(metaPath).catch(() => {
        console.error("Failed to delete meta file:", metaPath);
      });
    } catch {
      // If meta file is missing or unreadable we still proceed with DB deletion
      console.error(
        "Could not read meta for document, skipping disk cleanup:",
        documentId
      );
    }

    // Delete from database
    await db.document.delete({
      where: { id: documentId },
    });

    revalidateModulePaths();
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
    mimeType: string;
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
      mimeType: true,
      createdAt: true,
    },
  });

  return documents;
}

/**
 * Returns the absolute filesystem path of the document file, or `null` if
 * the document does not exist or the caller is not the owner.
 *
 * This is intended to be consumed by an API route that streams the file
 * back to the client.
 */
export async function getDocumentUrl(
  documentId: string
): Promise<string | null> {
  const userId = await requireAuth();

  const document = await db.document.findFirst({
    where: { id: documentId, userId },
  });

  if (!document) {
    return null;
  }

  // Resolve the physical path from the sidecar metadata
  const uploadDir = path.join(
    getUploadsRoot(),
    userId,
    document.dossierId
  );
  const metaPath = path.join(uploadDir, `${documentId}.meta.json`);

  try {
    const metaRaw = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaRaw) as { diskFilename: string };
    return path.join(uploadDir, meta.diskFilename);
  } catch {
    // Fallback: return the blobUrl which is the API route path
    return document.blobUrl;
  }
}
