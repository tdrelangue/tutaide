import path from "path";

/**
 * Pure helpers for document storage keys.
 *
 * A key is the path of a document RELATIVE to the documents folder:
 * `<ownerId>/<dossierId>/<timestamp>-<name>`. The DB keeps the absolute path
 * in `Document.blobUrl` (older builds read it directly), but every absolute
 * path written by Tutellia ends with those three segments, so the key can be
 * derived from it. That lets a PC whose documents folder differs (another
 * user name, a OneDrive folder, another computer) find the same file.
 */

const KEY_SEGMENTS = 3;

function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== "..";
}

/** The relative key of a stored document, or null when the path is too short. */
export function storageKeyFromBlobUrl(blobUrl: string): string | null {
  const segments = blobUrl.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segments.length < KEY_SEGMENTS) return null;
  const tail = segments.slice(-KEY_SEGMENTS);
  return tail.every(isSafeSegment) ? tail.join("/") : null;
}

const MAX_NAME_LENGTH = 120;

/**
 * File name on disk: timestamp prefix so two uploads never collide, and only
 * characters every OS accepts (no ":" alternate streams, no trailing dots).
 */
export function storedFileName(originalName: string, timestamp: number): string {
  const base = (originalName.split(/[\\/]+/).pop() ?? "")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(-MAX_NAME_LENGTH);
  return `${timestamp}-${base || "document"}`;
}

export function buildStorageKey(ownerId: string, dossierId: string, fileName: string): string {
  return [ownerId, dossierId, fileName].join("/");
}

/** Absolute path of a key under `root`. Throws if the key escapes the root. */
export function storageKeyToPath(root: string, key: string): string {
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, ...key.split("/"));
  const rel = path.relative(resolvedRoot, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Chemin de document invalide");
  }
  return full;
}

/**
 * Where to look for a document, in order: the key under the current documents
 * folder, then the exact path recorded at upload (files left in a previous
 * folder, or uploaded by an older build).
 */
export function candidateDocumentPaths(blobUrl: string, root: string): string[] {
  const key = storageKeyFromBlobUrl(blobUrl);
  let fromKey: string | null = null;
  try {
    fromKey = key ? storageKeyToPath(root, key) : null;
  } catch {
    // Odd legacy path (e.g. a drive letter in the tail): only the recorded path.
  }
  if (!fromKey || fromKey === blobUrl) return [blobUrl];
  return [fromKey, blobUrl];
}

/**
 * Every place a copy of the document may be on this computer: the current
 * folder, the recorded path, and each folder used before (copies are left
 * behind when changing folder). Used to delete a document completely.
 */
export function allCopyPaths(blobUrl: string, root: string, previousRoots: string[]): string[] {
  const paths = [root, ...previousRoots].flatMap((r) => candidateDocumentPaths(blobUrl, r));
  return paths.filter((p, i) => paths.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
}
