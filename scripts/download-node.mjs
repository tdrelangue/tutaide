/**
 * Downloads the Node.js standalone binary for the current platform
 * and places it in src-tauri/binaries/ for bundling with Tauri.
 *
 * Windows → src-tauri/binaries/node-win.exe
 * macOS   → src-tauri/binaries/node-mac
 *
 * Run with: npm run setup
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const binDir = join(root, "src-tauri", "binaries");
mkdirSync(binDir, { recursive: true });

const NODE_VERSION = "22.14.0"; // Node.js 22 LTS
const platform = process.platform;
const arch = process.arch;

if (platform === "win32") {
  const destPath = join(binDir, "node-win.exe");
  if (existsSync(destPath)) {
    console.log("Windows Node.js binary already present, skipping download.");
    console.log(`  → ${destPath}`);
    process.exit(0);
  }

  const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`;
  const zipPath = join(binDir, zipName);
  const extractDir = join(binDir, `node-v${NODE_VERSION}-win-x64`);

  console.log(`Downloading Node.js ${NODE_VERSION} for Windows x64 (~30 MB)...`);
  execSync(`curl -L --progress-bar "${url}" -o "${zipPath}"`, { stdio: "inherit" });

  console.log("Extracting node.exe...");
  // Escape single quotes for PowerShell ('' = literal single quote inside '...')
  const psZip = zipPath.replace(/'/g, "''");
  const psBin = binDir.replace(/'/g, "''");
  execSync(
    `powershell -Command "Expand-Archive -Path '${psZip}' -DestinationPath '${psBin}' -Force"`,
    { stdio: "inherit" }
  );

  renameSync(join(extractDir, "node.exe"), destPath);
  rmSync(zipPath, { force: true });
  rmSync(extractDir, { recursive: true, force: true });

  console.log(`✓ Node.js binary ready: src-tauri/binaries/node-win.exe`);

} else if (platform === "darwin") {
  const macArch = arch === "arm64" ? "arm64" : "x64";
  const destPath = join(binDir, "node-mac");

  if (existsSync(destPath)) {
    console.log("macOS Node.js binary already present, skipping download.");
    console.log(`  → ${destPath}`);
    process.exit(0);
  }

  const tarName = `node-v${NODE_VERSION}-darwin-${macArch}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarName}`;
  const tarPath = join(binDir, tarName);
  const extractDir = join(binDir, `node-v${NODE_VERSION}-darwin-${macArch}`);

  console.log(`Downloading Node.js ${NODE_VERSION} for macOS ${macArch} (~25 MB)...`);
  execSync(`curl -L --progress-bar "${url}" -o "${tarPath}"`, { stdio: "inherit" });

  console.log("Extracting node binary...");
  execSync(
    `tar -xzf "${tarPath}" -C "${binDir}" "node-v${NODE_VERSION}-darwin-${macArch}/bin/node"`,
    { stdio: "inherit" }
  );

  renameSync(join(extractDir, "bin", "node"), destPath);
  execSync(`chmod +x "${destPath}"`);
  rmSync(tarPath, { force: true });
  rmSync(extractDir, { recursive: true, force: true });

  console.log(`✓ Node.js binary ready: src-tauri/binaries/node-mac`);

} else {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}
