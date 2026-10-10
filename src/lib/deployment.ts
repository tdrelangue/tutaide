/**
 * How this server is deployed.
 *
 * - Desktop (default): the Tauri app runs its own server on the user's PC
 *   (TUTELLIA_DESKTOP=1); documents live in a folder of that PC.
 * - Server (TUTELLIA_MODE=server): an organisation hosts Tutellia on its own
 *   server (Docker, see deploy/); everyone connects to it with the app or a
 *   browser. Documents live in the server's storage folder, there is no demo,
 *   no self-signup (accounts come from the organisation admin) and no
 *   per-person billing (the organisation has a licence).
 */

export function isServerMode(): boolean {
  return process.env.TUTELLIA_MODE === "server";
}

/** The server's documents folder. A server without one must not start. */
export function getServerStorageDir(): string {
  const dir = process.env.TUTELLIA_STORAGE_DIR;
  if (!dir) {
    throw new Error("TUTELLIA_STORAGE_DIR est requis en mode serveur (dossier des documents)");
  }
  return dir;
}

/** Version shown by the health check (set at image build time). */
export function getAppVersion(): string {
  return process.env.TUTELLIA_VERSION ?? "dev";
}
