"use server";

// NOTE (ASH import): PDF text extraction requires `pdf-parse`.
// Run: npm install pdf-parse @types/pdf-parse
// Until installed, parseAshPdf will return null and the import zone
// will show an "extraction unavailable" error per file.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  findAccessibleDossierOwner,
  readMandataireSelection,
  requireOwnerScope,
} from "@/lib/access/context";
import {
  documentFileExists,
  removeDocumentFile,
  resolveDocumentFile,
  saveDocumentFile,
} from "@/lib/storage/document-files";
import { openFileWithMacOs } from "@/lib/open-native";

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
  documents?: Array<{ id: string; filename: string; mimeType: string; size: number; createdAt: Date }>;
  error?: string;
}> {
  try {
    const dossierId = formData.get("dossierId") as string;
    const files = formData.getAll("files") as File[];

    if (!dossierId || files.length === 0) {
      return { success: false, error: "Donnees manquantes" };
    }

    const access = await findAccessibleDossierOwner(dossierId);
    if (!access) {
      return { success: false, error: "Dossier non trouve" };
    }

    const uploadedDocs: Array<{ id: string; filename: string; mimeType: string; size: number; createdAt: Date }> = [];

    for (const file of files) {
      if (!isAllowedFile(file)) {
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = await saveDocumentFile(access.ownerId, dossierId, file.name, buffer);

      const doc = await db.document.create({
        data: {
          filename: file.name,
          blobUrl: filePath,
          size: file.size,
          mimeType: file.type,
          userId: access.ownerId,
          uploadedById: access.actorId,
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
    const { ownerIds } = await requireOwnerScope();

    const document = await db.document.findFirst({
      where: { id: documentId, userId: { in: ownerIds } },
    });

    if (!document) {
      return { success: false, error: "Document non trouve" };
    }

    await removeDocumentFile(document.blobUrl);

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
  const { ownerIds } = await requireOwnerScope();

  const documents = await db.document.findMany({
    where: { dossierId, userId: { in: ownerIds } },
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
    .filter((doc) => documentFileExists(doc.blobUrl))
    .map(({ blobUrl: _url, ...doc }) => doc);
}

export async function getDocumentUrl(
  documentId: string
): Promise<string | null> {
  const { ownerIds } = await requireOwnerScope();

  const document = await db.document.findFirst({
    where: { id: documentId, userId: { in: ownerIds } },
  });

  if (!document) {
    return null;
  }

  return `/api/documents/${documentId}/download`;
}

/**
 * Opens the document in its default app on the desktop app for macOS, where
 * the webview cannot open it itself. `opened: false` means the caller should
 * fall back to the browser download.
 */
export async function openDocumentNatively(
  documentId: string
): Promise<{ opened: boolean }> {
  try {
    const { ownerIds } = await requireOwnerScope();
    const document = await db.document.findFirst({
      where: { id: documentId, userId: { in: ownerIds } },
      select: { blobUrl: true },
    });
    const file = document ? resolveDocumentFile(document.blobUrl) : null;
    if (!file) return { opened: false };
    return { opened: await openFileWithMacOs(file) };
  } catch {
    return { opened: false };
  }
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
      text.match(/((?:Mlle\.?|Mme\.?|M\.?|Dr\.?)\s+[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s'-]+?)\s+Prot[eé]g[eé]/i) ??
      text.match(/Prot[eé]g[eé]\s*:\s*((?:Mlle\.?|Mme\.?|M\.?|Dr\.?)?\s*[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s'-]+)/);
    if (!protegeMatch) {
      return { success: false, error: "Nom du protégé introuvable dans le PDF" };
    }

    // Normalize: strip civility prefix, trailing isolated uppercase letters (e.g. "A" from "Aide"), and extra spaces
    const rawName = protegeMatch[1].trim().replace(/\s+/g, " ")
      .replace(/^(?:Mlle\.?\s+|Mme\.?\s+|M\.?\s+|Dr\.?\s+)/i, "")  // remove civility
      .replace(/(\s+[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ])+$/, "")         // remove trailing single uppercase word(s)
      .trim();
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
 * The MJPM an auto-created ASH dossier belongs to: the actor (solo, MJPM),
 * else the MJPM given by the caller, else the one selected in the header.
 * Null = an assistant viewing "all" must say which MJPM first.
 */
async function ashOwnerFor(
  scope: Awaited<ReturnType<typeof requireOwnerScope>>,
  requested?: string
): Promise<string | null> {
  if (scope.actor.orgRole !== "ASSISTANT") return scope.ownerIds[0] ?? null;
  const selection = await readMandataireSelection();
  const candidate = requested ?? (selection !== "all" ? selection : undefined);
  return candidate && scope.ownerIds.includes(candidate) ? candidate : null;
}

/**
 * Find a dossier by fullName (case-insensitive) for the ASH module among the
 * dossiers on screen, or create a minimal one if none exists.
 * `needsOwner: true` = an assistant viewing all their MJPMs must choose which
 * MJPM the new dossier is for (then call again with `ownerId`).
 */
export async function findOrCreateAshDossier(
  protegeName: string,
  ownerId?: string
): Promise<{ success: boolean; dossierId?: string; created?: boolean; needsOwner?: boolean; error?: string }> {
  try {
    const scope = await requireOwnerScope({ narrowed: true });
    const normalized = protegeName.trim();

    const existing = await db.dossier.findFirst({
      where: {
        userId: { in: scope.ownerIds },
        moduleType: "ASH",
        fullName: { equals: normalized, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      return { success: true, dossierId: existing.id, created: false };
    }

    const userId = await ashOwnerFor(scope, ownerId);
    if (!userId) {
      return scope.ownerIds.length > 0
        ? { success: false, needsOwner: true }
        : { success: false, error: "Ce compte n'a pas acces aux dossiers" };
    }

    // Auto-assign global ASH quarterly default template
    const defaultTemplate = await db.emailTemplate.findFirst({
      where: { isGlobal: true, isDefault: true, category: "ASH" },
      select: { id: true },
    });

    const created = await db.dossier.create({
      data: {
        fullName: normalized,
        moduleType: "ASH",
        priority: "NORMAL",
        status: "ACTIVE",
        userId,
        createdById: scope.actorId,
        defaultTemplateId: defaultTemplate?.id ?? null,
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

// ---------------------------------------------------------------------------
// Manual sorting
// ---------------------------------------------------------------------------

const SORTABLE_MODULES = new Set(["APA", "ASH", "PCH"]);

export type SortingTarget = {
  id: string;
  fullName: string;
  status: "ACTIVE" | "CLOSED";
  /** The MJPM owning the dossier (assistants handle several). */
  ownerId: string;
  ownerName: string;
};

/**
 * Every dossier of the module the user may file into, active and closed, for
 * the manual sorting screen. Assistants get all their MJPMs' dossiers; the
 * screen narrows by MJPM itself.
 */
export async function listSortingTargets(moduleType: string): Promise<SortingTarget[]> {
  const { ownerIds } = await requireOwnerScope();
  if (!SORTABLE_MODULES.has(moduleType)) return [];

  const dossiers = await db.dossier.findMany({
    where: { userId: { in: ownerIds }, moduleType: moduleType as "APA" | "ASH" | "PCH" }, // checked against SORTABLE_MODULES above
    select: { id: true, fullName: true, status: true, user: { select: { id: true, name: true, email: true } } },
  });
  return dossiers.map(({ user, ...d }) => ({ ...d, ownerId: user.id, ownerName: user.name || user.email }));
}
