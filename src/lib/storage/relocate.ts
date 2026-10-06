import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * Copies the documents folder to a new location (Settings → "Emplacement des
 * documents"). Copy, never move: the old folder stays intact, so going back to
 * it always works and nothing is lost if the copy is interrupted.
 */

export type CopyReport = { copied: number; alreadyThere: number; failed: number };

/** Real path (junctions/symlinks followed) of a folder that may not exist yet. */
export async function realFolderPath(dir: string): Promise<string> {
  try {
    return await fs.realpath(dir);
  } catch {
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(dir);
    return path.join(await realFolderPath(parent), path.basename(dir));
  }
}

/** True when `inner` is `outer` itself or a folder inside it. */
export function isSameOrInside(inner: string, outer: string): boolean {
  const rel = path.relative(path.resolve(outer), path.resolve(inner));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Throws a user-facing message when the folder cannot hold documents. */
export async function assertWritableFolder(dir: string): Promise<void> {
  if (!path.isAbsolute(dir)) throw new Error("Indiquez le chemin complet du dossier");
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.tutellia-test-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
  } catch {
    throw new Error("Impossible d'écrire dans ce dossier (droits insuffisants ou dossier inaccessible)");
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
}

async function sameSize(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)]);
  return sa.size === sb.size;
}

/**
 * Copies to `<target>.part`, checks the size, then renames: an interrupted
 * copy never leaves a truncated file under the real name. An existing target
 * only counts as done when its size matches (else it is replaced).
 */
async function copyOne(source: string, target: string): Promise<keyof CopyReport> {
  try {
    if (existsSync(target) && (await sameSize(source, target))) return "alreadyThere";
    await fs.mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.part`;
    await fs.copyFile(source, partial);
    if (!(await sameSize(source, partial))) return "failed";
    await fs.rename(partial, target);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Copies every file of `from` into `to`, keeping the same relative paths. */
export async function copyDocumentsTree(from: string, to: string): Promise<CopyReport> {
  const report: CopyReport = { copied: 0, alreadyThere: 0, failed: 0 };
  if (!existsSync(from)) return report;

  for (const source of await listFiles(from)) {
    const target = path.join(to, path.relative(from, source));
    report[await copyOne(source, target)] += 1;
  }
  return report;
}
