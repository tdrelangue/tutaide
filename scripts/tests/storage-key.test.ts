// Run: npx tsx scripts/tests/storage-key.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import { switchedSettings } from "../../src/lib/storage/machine-settings";
import {
  allCopyPaths,
  buildStorageKey,
  candidateDocumentPaths,
  storageKeyFromBlobUrl,
  storageKeyToPath,
  storedFileName,
} from "../../src/lib/storage/storage-key";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const root = path.resolve("/data/OneDrive/Tutellia");

check("derives the key from a Windows absolute path", () => {
  const blob = "C:\\Users\\marie\\AppData\\Roaming\\tutaide\\documents\\u1\\d1\\1700-releve.pdf";
  assert.equal(storageKeyFromBlobUrl(blob), "u1/d1/1700-releve.pdf");
});

check("derives the key from a macOS absolute path", () => {
  const blob = "/Users/marie/Library/Application Support/tutaide/documents/u1/d1/1700-a b.pdf";
  assert.equal(storageKeyFromBlobUrl(blob), "u1/d1/1700-a b.pdf");
});

check("rejects paths too short to hold a key", () => {
  assert.equal(storageKeyFromBlobUrl("d1/file.pdf"), null);
});

check("rejects keys containing '..'", () => {
  assert.equal(storageKeyFromBlobUrl("/x/../d1/file.pdf"), null);
});

check("stored file name keeps only the base name", () => {
  assert.equal(storedFileName("..\\..\\evil.pdf", 5), "5-evil.pdf");
  assert.equal(storedFileName("relevé.pdf", 5), "5-relevé.pdf");
});

check("stored file name strips characters Windows refuses", () => {
  assert.equal(storedFileName('a:b<c>"d|e?f*.pdf', 5), "5-a_b_c__d_e_f_.pdf");
  assert.equal(storedFileName("notes. . ", 5), "5-notes");
  assert.equal(storedFileName("x".repeat(300) + ".pdf", 5).length, 2 + 120);
  assert.equal(storedFileName("...", 5), "5-document");
});

check("an odd legacy path never throws", () => {
  assert.deepEqual(candidateDocumentPaths("C:", root), ["C:"]);
});

check("key under a new root resolves inside that root", () => {
  const key = buildStorageKey("u1", "d1", "5-a.pdf");
  assert.equal(storageKeyToPath(root, key), path.join(root, "u1", "d1", "5-a.pdf"));
});

check("a key escaping the root is refused", () => {
  assert.throws(() => storageKeyToPath(root, "../../etc/passwd"));
});

check("candidates: new root first, recorded path as fallback", () => {
  const blob = "C:\\old\\documents\\u1\\d1\\5-a.pdf";
  assert.deepEqual(candidateDocumentPaths(blob, root), [
    path.join(root, "u1", "d1", "5-a.pdf"),
    blob,
  ]);
});

check("candidates: same folder gives a single path", () => {
  const blob = path.join(root, "u1", "d1", "5-a.pdf");
  assert.deepEqual(candidateDocumentPaths(blob, root), [blob]);
});

check("deletion targets copies in every folder used before", () => {
  const oneDrive = path.resolve("/data/OneDrive/Tutellia");
  const def = path.resolve("/appdata/tutaide/documents");
  const blob = path.join(def, "u1", "d1", "5-a.pdf");
  assert.deepEqual(allCopyPaths(blob, def, [oneDrive]), [blob, path.join(oneDrive, "u1", "d1", "5-a.pdf")]);
});

check("switching folder remembers the old one, never the new one", () => {
  const a = path.resolve("/a");
  const b = path.resolve("/b");
  const s1 = switchedSettings({ documentsDir: null, previousDocumentsDirs: [] }, a, b, b);
  assert.deepEqual(s1, { documentsDir: b, previousDocumentsDirs: [a] });
  const s2 = switchedSettings(s1, b, a, null);
  assert.deepEqual(s2, { documentsDir: null, previousDocumentsDirs: [b] });
  const s3 = switchedSettings(s2, a, b, b);
  assert.deepEqual(s3.previousDocumentsDirs, [a]);
});

console.log(`\n${passed} checks passed`);
