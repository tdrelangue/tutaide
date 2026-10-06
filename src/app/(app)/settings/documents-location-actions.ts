"use server";

import path from "path";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { isDemoActive } from "@/lib/demo/state";
import { getDefaultDocumentsDir, getDocumentsBaseDir } from "@/lib/documents-dir";
import {
  readMachineSettings,
  switchedSettings,
  writeMachineSettings,
} from "@/lib/storage/machine-settings";
import {
  assertWritableFolder,
  copyDocumentsTree,
  isSameOrInside,
  realFolderPath,
  type CopyReport,
} from "@/lib/storage/relocate";

export type DocumentsLocation = {
  current: string;
  defaultDir: string;
  isDefault: boolean;
  /** Demo mode: documents live in a temp folder that cannot be changed. */
  isLocked: boolean;
};

export async function getDocumentsLocation(): Promise<DocumentsLocation> {
  await requireAuth();
  const current = getDocumentsBaseDir();
  const defaultDir = getDefaultDocumentsDir();
  return {
    current,
    defaultDir,
    isDefault: path.resolve(current) === path.resolve(defaultDir),
    isLocked: isDemoActive(),
  };
}

export type ChangeLocationResult =
  | { success: true; report: CopyReport | null }
  | { success: false; error: string };

/**
 * Switches this computer to another documents folder.
 * `dir = null` goes back to the default folder.
 * `copyDocuments` copies the current folder's files first; the switch only
 * happens if every file was copied (the old folder is never emptied).
 */
export async function changeDocumentsLocation(
  dir: string | null,
  copyDocuments: boolean
): Promise<ChangeLocationResult> {
  try {
    await requireAuth();
    if (isDemoActive()) {
      return { success: false, error: "Indisponible pendant le test de l'application" };
    }

    const from = getDocumentsBaseDir();
    const to = path.resolve(dir ?? getDefaultDocumentsDir());
    if (path.resolve(from) === to) return { success: true, report: null };
    const [realFrom, realTo] = await Promise.all([realFolderPath(from), realFolderPath(to)]);
    if (isSameOrInside(realTo, realFrom) || isSameOrInside(realFrom, realTo)) {
      return { success: false, error: "Choisissez un dossier qui n'est ni dans l'emplacement actuel, ni un de ses dossiers parents" };
    }

    await assertWritableFolder(to);

    const report = copyDocuments ? await copyDocumentsTree(from, to) : null;
    if (report && report.failed > 0) {
      return {
        success: false,
        error: `${report.failed} document(s) n'ont pas pu être copiés. L'emplacement n'a pas été changé.`,
      };
    }

    writeMachineSettings(
      switchedSettings(readMachineSettings(), from, to, dir === null ? null : to)
    );
    revalidatePath("/", "layout");
    return { success: true, report };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue";
    return { success: false, error: message };
  }
}
