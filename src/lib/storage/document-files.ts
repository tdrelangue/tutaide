import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getDocumentsBaseDir } from "@/lib/documents-dir";
import { readMachineSettings } from "./machine-settings";
import {
  allCopyPaths,
  buildStorageKey,
  candidateDocumentPaths,
  storageKeyToPath,
  storedFileName,
} from "./storage-key";

/**
 * Every read/write of a document file goes through here, so the documents
 * folder can be moved (Settings → "Emplacement des documents") without
 * touching the DB. `blobUrl` is the path recorded at upload; see storage-key.ts.
 */

/** The path where the file is actually found on this computer, or null. */
export function resolveDocumentFile(blobUrl: string): string | null {
  const candidates = candidateDocumentPaths(blobUrl, getDocumentsBaseDir());
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function documentFileExists(blobUrl: string): boolean {
  return resolveDocumentFile(blobUrl) !== null;
}

/**
 * Paths to attach to an email. A file not found keeps its recorded path, so
 * the mailer reports it as unreadable (same behaviour as before).
 */
export function attachmentPathsFor(blobUrls: string[]): string[] {
  return blobUrls.map((blobUrl) => resolveDocumentFile(blobUrl) ?? blobUrl);
}

export async function readDocumentFile(blobUrl: string): Promise<Buffer | null> {
  const file = resolveDocumentFile(blobUrl);
  if (!file) return null;
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

/**
 * Deletes the file everywhere it exists: after a folder change the old folder
 * still holds a copy, which must not outlive the document (personal data).
 * A file already gone is not an error.
 */
export async function removeDocumentFile(blobUrl: string): Promise<void> {
  const candidates = allCopyPaths(
    blobUrl,
    getDocumentsBaseDir(),
    readMachineSettings().previousDocumentsDirs
  );
  for (const file of candidates.filter((p) => existsSync(p))) {
    try {
      await fs.unlink(file);
    } catch (error) {
      console.error("Failed to delete document file:", error);
    }
  }
}

/**
 * Writes an uploaded file for a dossier. `ownerId` is the dossier owner (not
 * whoever uploads), so every person working on the dossier finds it.
 * Returns the absolute path to store in `Document.blobUrl`.
 */
export async function saveDocumentFile(
  ownerId: string,
  dossierId: string,
  originalName: string,
  content: Buffer
): Promise<string> {
  const key = buildStorageKey(ownerId, dossierId, storedFileName(originalName, Date.now()));
  const filePath = storageKeyToPath(getDocumentsBaseDir(), key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}
