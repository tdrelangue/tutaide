// Run: npx tsx scripts/tests/relocate.test.ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertWritableFolder, copyDocumentsTree, isSameOrInside } from "../../src/lib/storage/relocate";
import { candidateDocumentPaths } from "../../src/lib/storage/storage-key";

async function main(): Promise<void> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "tutellia-relocate-"));
  const oldRoot = path.join(base, "old");
  const newRoot = path.join(base, "OneDrive", "Tutellia");
  const oldFile = path.join(oldRoot, "u1", "d1", "17-releve.pdf");
  await fs.mkdir(path.dirname(oldFile), { recursive: true });
  await fs.writeFile(oldFile, "pdf-bytes");
  await fs.mkdir(path.join(oldRoot, "u1", "d2"), { recursive: true });
  await fs.writeFile(path.join(oldRoot, "u1", "d2", "18-avis.png"), "png");

  try {
    assert.equal(isSameOrInside(path.join(oldRoot, "sub"), oldRoot), true);
    assert.equal(isSameOrInside(newRoot, oldRoot), false);
    console.log("ok - nested folder detection");

    await assertWritableFolder(newRoot);
    await assert.rejects(assertWritableFolder("relative/path"));
    console.log("ok - writable check");

    const first = await copyDocumentsTree(oldRoot, newRoot);
    assert.deepEqual(first, { copied: 2, alreadyThere: 0, failed: 0 });
    const second = await copyDocumentsTree(oldRoot, newRoot);
    assert.deepEqual(second, { copied: 0, alreadyThere: 2, failed: 0 });
    assert.equal(existsSync(oldFile), true, "old folder is never emptied");
    console.log("ok - copy is complete, idempotent and non-destructive");

    const newFile = path.join(newRoot, "u1", "d1", "17-releve.pdf");
    await fs.writeFile(newFile, "pdf"); // truncated leftover of an interrupted copy
    const repair = await copyDocumentsTree(oldRoot, newRoot);
    assert.deepEqual(repair, { copied: 1, alreadyThere: 1, failed: 0 });
    assert.equal(await fs.readFile(newFile, "utf8"), "pdf-bytes");
    assert.equal(existsSync(`${newFile}.part`), false);
    console.log("ok - a truncated file already in the new folder is replaced");

    const [fromKey] = candidateDocumentPaths(oldFile, newRoot);
    assert.equal(await fs.readFile(fromKey, "utf8"), "pdf-bytes");
    console.log("ok - a recorded old path resolves inside the new folder");
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
