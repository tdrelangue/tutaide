/**
 * Post-build script: copies static assets and public files into the
 * Next.js standalone directory so Tauri can bundle it as a resource.
 */
import { cpSync, existsSync } from "fs";
import { join } from "path";

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

// Copy .env files → standalone/
for (const envFile of [".env", ".env.local"]) {
  const envSrc = join(root, envFile);
  const envDest = join(standalone, envFile);
  if (existsSync(envSrc)) {
    cpSync(envSrc, envDest);
    console.log(`Copied ${envFile} → standalone/${envFile}`);
  }
}

console.log("Standalone preparation complete.");
