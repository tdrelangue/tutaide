// The engine must stay exportable as is (standalone product, plan D11):
// it may import only its own files, never anything from Tutellia.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SOURCES = ["domain", "geo"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

// Static imports and re-exports, side-effect imports, dynamic import() and require().
const IMPORT_PATTERNS = [
  /(?:import|export)[^"';]*?from\s+["']([^"']+)["']/g,
  /import\s+["']([^"']+)["']/g,
  /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  /require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
];

function imports(source: string): string[] {
  return IMPORT_PATTERNS.flatMap((re) =>
    [...source.matchAll(re)].map((m) => m[1] ?? ""),
  );
}

describe("engine boundary", () => {
  it("sees every kind of import", () => {
    const source = [
      'import { a } from "./a";',
      'export * from "@/lib/db";',
      'import "next/headers";',
      'const m = await import("@prisma/client");',
      'const fs = require("../../agenda/service");',
    ].join("\n");
    expect(imports(source).sort()).toEqual(
      ["./a", "@/lib/db", "next/headers", "@prisma/client", "../../agenda/service"].sort(),
    );
  });

  it("imports nothing from outside the engine folder", () => {
    const offenders: string[] = [];
    for (const file of SOURCES.flatMap((d) => files(join(ROOT, d)))) {
      for (const spec of imports(readFileSync(file, "utf8"))) {
        const inside =
          spec.startsWith(".") &&
          !relative(ROOT, resolve(file, "..", spec)).startsWith("..");
        if (!inside) offenders.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
