/**
 * Post-build script: copies static assets and public files into the
 * Next.js standalone directory so Tauri can bundle it as a resource.
 */
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, relative } from "path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("No standalone output found, skipping prepare-standalone.");
  process.exit(0);
}

// Copy .next/static → standalone/.next/static
const staticSrc = join(root, ".next", "static");
const staticDest = join(standalone, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log("Copied .next/static → standalone/.next/static");
}

// Copy public/ → standalone/public/
const publicSrc = join(root, "public");
const publicDest = join(standalone, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("Copied public/ → standalone/public/");
}

// Copy .env files → standalone/ and patch NEXTAUTH_URL for production port
for (const envFile of [".env", ".env.local"]) {
  const envSrc = join(root, envFile);
  const envDest = join(standalone, envFile);
  if (existsSync(envSrc)) {
    cpSync(envSrc, envDest);
    // Fix NEXTAUTH_URL to use the production server port (3456) instead of dev (3000)
    let contents = readFileSync(envDest, "utf8");
    if (contents.includes("NEXTAUTH_URL")) {
      contents = contents.replace(
        /NEXTAUTH_URL=["']?http:\/\/[^"'\n]+["']?/g,
        'NEXTAUTH_URL="http://localhost:3456"'
      );
      writeFileSync(envDest, contents);
      console.log(`Patched NEXTAUTH_URL in ${envFile} → production port 3456`);
    }
    console.log(`Copied ${envFile} → standalone/${envFile}`);
  }
}

// Fix Turbopack's hashed external module IDs.
//
// Turbopack compiles server chunks that call require('<pkg>-<16hexchars>') for every
// external package it encounters (e.g. pino-28069d5257187539, @prisma/client-2c3a283f134fdcb6).
// These hashed names don't exist in node_modules, so we scan all SSR chunks, collect
// every hashed module ID, strip the hash suffix to recover the real package name, and
// create tiny shim packages that re-export the real package.
//
// Finding the real package: Node.js resolves require() relative to the calling file, but
// our shim lives at standalone/node_modules/<hash>/index.js. If the base package is nested
// (e.g. standalone/node_modules/next/node_modules/pino) a plain require('pino') won't
// find it. So we search the standalone tree and use an absolute path in the shim when
// the package is found only in a nested location.

/** Search standalone/node_modules for a package, returning its absolute directory path. */
function findPackagePath(standaloneDir, packageName) {
  const nmDir = join(standaloneDir, "node_modules");
  if (!existsSync(nmDir)) return null;

  // 1. Top-level
  const topLevel = join(nmDir, packageName);
  if (existsSync(topLevel)) return topLevel;

  // 2. One level deep (e.g. node_modules/next/node_modules/pino)
  for (const entry of readdirSync(nmDir)) {
    // Handle scoped packages (@scope/name)
    if (entry.startsWith("@")) {
      const scopeDir = join(nmDir, entry);
      try {
        for (const scoped of readdirSync(scopeDir)) {
          const nested = join(scopeDir, scoped, "node_modules", packageName);
          if (existsSync(nested)) return nested;
        }
      } catch { /* skip unreadable */ }
    } else {
      const nested = join(nmDir, entry, "node_modules", packageName);
      if (existsSync(nested)) return nested;
    }
  }
  return null;
}

// Turbopack hashed module pattern: optional @scope/ prefix, then name-<16hexchars>
const HASHED_MODULE_RE = /(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+-[a-f0-9]{16}/g;

const ssrChunksDir = join(standalone, ".next", "server", "chunks", "ssr");
if (existsSync(ssrChunksDir)) {
  const hashedModules = new Set();

  for (const file of readdirSync(ssrChunksDir)) {
    if (!file.endsWith(".js")) continue;
    const content = readFileSync(join(ssrChunksDir, file), "utf8");
    for (const m of content.matchAll(HASHED_MODULE_RE)) {
      hashedModules.add(m[0]);
    }
  }

  let shimCount = 0;
  for (const shimName of hashedModules) {
    const shimDir = join(standalone, "node_modules", shimName);

    // Strip the trailing -<16hexchars> to recover the base package name
    const baseName = shimName.replace(/-[a-f0-9]{16}$/, "");

    // Find where the base package actually lives in the standalone tree
    const basePath = findPackagePath(standalone, baseName);
    // Use a RELATIVE path from the shim to the package so the shim works on any
    // machine regardless of where the app is installed (absolute paths break).
    const requireArg = basePath
      ? JSON.stringify(relative(shimDir, basePath).replace(/\\/g, "/"))
      : JSON.stringify(baseName);

    mkdirSync(shimDir, { recursive: true });
    writeFileSync(
      join(shimDir, "package.json"),
      JSON.stringify({ name: shimName, version: "1.0.0", main: "index.js" }, null, 2)
    );
    writeFileSync(join(shimDir, "index.js"), `module.exports = require(${requireArg});\n`);

    const location = basePath ? "(found at absolute path)" : "(base package not found — may still work)";
    console.log(`Turbopack shim: ${shimName} → ${baseName} ${location}`);
    shimCount++;
  }

  console.log(`Created ${shimCount} Turbopack external module shim(s).`);
}

console.log("Standalone preparation complete.");
