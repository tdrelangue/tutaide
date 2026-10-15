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

function imports(source: string): string[] {
  return [
    ...source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g),
  ].map((m) => m[1] ?? "");
}

describe("engine boundary", () => {
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
