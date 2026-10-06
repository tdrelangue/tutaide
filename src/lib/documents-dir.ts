import path from "path";
import os from "os";
import { getDemoDocumentsDir, isDemoActive } from "./demo/state";

/**
 * Returns the base directory for storing documents locally.
 * On Windows: %APPDATA%/tutaide/documents
 * On macOS: ~/Library/Application Support/tutaide/documents
 * On Linux: ~/.config/tutaide/documents
 */
export function getDocumentsBaseDir(): string {
  // Demo documents never mix with real ones: temp folder, wiped after the demo.
  if (isDemoActive()) return getDemoDocumentsDir();

  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".config"));

  return path.join(appData, "tutaide", "documents");
}

/**
 * Returns the full path for a document file.
 */
export function getDocumentPath(
  userId: string,
  dossierId: string,
  filename: string
): string {
  return path.join(getDocumentsBaseDir(), userId, dossierId, filename);
}
