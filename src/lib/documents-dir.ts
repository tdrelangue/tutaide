import path from "path";
import { getDemoDocumentsDir, isDemoActive } from "./demo/state";
import { getAppDataDir, readMachineSettings } from "./storage/machine-settings";

/**
 * The default documents folder, used until the user picks another one.
 * On Windows: %APPDATA%/tutaide/documents
 * On macOS: ~/Library/Application Support/tutaide/documents
 * On Linux: ~/.config/tutaide/documents
 */
export function getDefaultDocumentsDir(): string {
  return path.join(getAppDataDir(), "tutaide", "documents");
}

/**
 * The folder documents are stored in on this computer: the one chosen in
 * Settings ("Emplacement des documents", e.g. a OneDrive folder), else the
 * default folder.
 */
export function getDocumentsBaseDir(): string {
  // Demo documents never mix with real ones: temp folder, wiped after the demo.
  if (isDemoActive()) return getDemoDocumentsDir();

  return readMachineSettings().documentsDir ?? getDefaultDocumentsDir();
}
