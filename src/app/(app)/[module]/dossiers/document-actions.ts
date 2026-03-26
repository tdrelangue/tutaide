"use server";

// NOTE (ASH import): PDF text extraction requires `pdf-parse`.
// Run: npm install pdf-parse @types/pdf-parse
// Until installed, parseAshPdf will return null and the import zone
// will show an "extraction unavailable" error per file.

import fs from "fs/promises";
import { existsSync } from "fs";
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

function revalidateModulePaths(): void {
  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");
}

function isAllowedFile(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE;
}

export async function uploadDocuments(formData: FormData): Promise<{
  success: boolean;
  count?: number;
  documents?: Array<{ id: string; filename: string; size: number; createdAt: Date }>;
  error?: string;
}> {
  try {
    const userId = await requireAuth();
    const dossierId = formData.get("dossierId") as string;
    const files = formData.getAll("files") as File[];

    if (!dossierId || files.length === 0) {
      return { success: false, error: "Donnees manquantes" };
    }

    const dossier = await db.dossier.findFirst({
      where: { id: dossierId, userId },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouve" };
    }

    const uploadedDocs: Array<{ id: string; filename: string; mimeType: string; size: number; createdAt: Date }> = [];
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

      uploadedDocs.push({ id: doc.id, filename: doc.filename, mimeType: doc.mimeType, size: doc.size, createdAt: doc.createdAt });
    }

    if (uploadedDocs.length === 0) {
      return {
        success: false,
        error: "Aucun fichier valide (PDF ou image, max 10 Mo)",
      };
    }

    revalidateModulePaths();
    return { success: true, count: uploadedDocs.length, documents: uploadedDocs };
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
      return { success: false, error: "Document non trouve" };
    }

    try {
      await fs.unlink(document.blobUrl);
    } catch {
      console.error("Failed to delete local file:", document.blobUrl);
    }

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
      blobUrl: true,
    },
  });

  // Only return documents whose file actually exists on this machine
  return documents
    .filter((doc) => existsSync(doc.blobUrl))
    .map(({ blobUrl: _url, ...doc }) => doc);
}

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

  return `/api/documents/${documentId}/download`;
}

// ---------------------------------------------------------------------------
// ASH Auto-Import
// ---------------------------------------------------------------------------

/**
 * Parse an ASH PDF and extract protégé name + period label.
 * Requires `pdf-parse` to be installed (npm install pdf-parse @types/pdf-parse).
 * Returns null when the dependency is missing or text extraction fails.
 */
export async function parseAshPdf(formData: FormData): Promise<{
  success: boolean;
  protegeName?: string;
  periodLabel?: string;
  error?: string;
}> {
  try {
    const file = formData.get("file") as File | null;
    if (!file || file.type !== "application/pdf") {
      return { success: false, error: "Fichier PDF requis" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      // Polyfill DOM types required by pdfjs-dist in a Node/Tauri environment
      if (typeof globalThis.DOMMatrix === "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).DOMMatrix = class DOMMatrix {
          a=1;b=0;c=0;d=1;e=0;f=0;
          constructor(_init?: string | number[]) {}
          multiply() { return this; }
          translate() { return this; }
          scale() { return this; }
          rotate() { return this; }
          inverse() { return this; }
          transformPoint(p: {x?:number;y?:number}) { return { x: p.x??0, y: p.y??0 }; }
        };
      }
      if (typeof globalThis.Path2D === "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Path2D = class Path2D {};
      }
      if (typeof globalThis.ImageData === "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).ImageData = class ImageData {
          constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
        };
      }
      // pdfjs-dist legacy build works in Node without DOM polyfills
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Point to the worker file so pdfjs can load it as a fake worker in Node
      const workerPath = (await import("path")).resolve(
        process.cwd(),
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
      );
      // Strip Windows extended-length prefix (\\?\) which is invalid in file URLs
      const normalizedWorkerPath = workerPath.replace(/^\\\\\?\\/, "").replace(/\\/g, "/");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `file:///${normalizedWorkerPath}`;
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages.push(content.items.map((item: any) => item.str ?? "").join(" "));
      }
      text = pages.join("\n");
    } catch (e) {
      console.error("[parseAshPdf] PDF extraction failed:", e);
      return {
        success: false,
        error: `Erreur lecture PDF : ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    console.log("[parseAshPdf] extracted text (first 500 chars):", text.slice(0, 500));

    // Extract protégé name.
    // PDF column layout places the name BEFORE the label, e.g.:
    //   "M. PHILIPPE CASTILLON Protégé :  01/06/2022"
    // Fallback: label-first format "Protégé : M. FIRSTNAME LASTNAME"
    const protegeMatch =
      text.match(/(?:M\.?|Mme\.?|Dr\.?)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s'-]+?)\s+Prot[eé]g[eé]/i) ??
      text.match(/Prot[eé]g[eé]\s*:\s*(?:M\.?|Mme\.?|Dr\.?)?\s*([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s'-]+)/i);
    if (!protegeMatch) {
      return { success: false, error: "Nom du protégé introuvable dans le PDF" };
    }

    // Normalize: "PHILIPPE CASTILLON" → keep last word as surname
    const rawName = protegeMatch[1].trim().replace(/\s+/g, " ");
    const parts = rawName.split(" ");
    const surname = parts[parts.length - 1]; // e.g. "CASTILLON"
    const protegeName = rawName; // full name for dossier matching

    // Extract period — pattern: "du DD/MM/YYYY au DD/MM/YYYY"
    const periodMatch = text.match(/du\s+(\d{2}\/\d{2}\/(\d{4}))\s+au\s+(\d{2}\/(\d{2})\/\d{4})/i);
    let periodLabel = surname; // fallback
    if (periodMatch) {
      const startMonth = parseInt(periodMatch[1].split("/")[1], 10);
      const year = periodMatch[2];
      const quarter = Math.ceil(startMonth / 3);
      periodLabel = `ASH \u2013 ${surname} \u2013 Q${quarter} ${year}`;
    }

    return { success: true, protegeName, periodLabel };
  } catch (error) {
    console.error("parseAshPdf error:", error);
    return { success: false, error: "Erreur lors de l'analyse du PDF" };
  }
}

/**
 * Find a dossier by fullName (case-insensitive) for the ASH module,
 * or create a minimal one if none exists.
 */
export async function findOrCreateAshDossier(
  protegeName: string
): Promise<{ success: boolean; dossierId?: string; created?: boolean; error?: string }> {
  try {
    const userId = await requireAuth();
    const normalized = protegeName.trim();

    const existing = await db.dossier.findFirst({
      where: {
        userId,
        moduleType: "ASH",
        fullName: { equals: normalized, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      return { success: true, dossierId: existing.id, created: false };
    }

    const created = await db.dossier.create({
      data: {
        fullName: normalized,
        moduleType: "ASH",
        priority: "NORMAL",
        status: "ACTIVE",
        userId,
      },
      select: { id: true },
    });

    revalidateModulePaths();
    return { success: true, dossierId: created.id, created: true };
  } catch (error) {
    console.error("findOrCreateAshDossier error:", error);
    return { success: false, error: "Erreur lors de la recherche/création du dossier" };
  }
}
