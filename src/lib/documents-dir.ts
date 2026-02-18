import path from "path";
import os from "os";

/**
 * Returns the base directory for storing documents locally.
 * On Windows: %APPDATA%/tutaide/documents
 * On macOS: ~/Library/Application Support/tutaide/documents
 * On Linux: ~/.config/tutaide/documents
 */
export function getDocumentsBaseDir(): string {
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
