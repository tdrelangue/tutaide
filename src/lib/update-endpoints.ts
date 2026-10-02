import { db } from "./db";

/**
 * Where the desktop updater looks for latest.json.
 *
 * Order: the URL the software admin saved in the database (so the update host
 * can move without a new release), then the built-in defaults. The defaults are
 * also in src-tauri/tauri.conf.json, used if the database can't be reached.
 * The signing public key stays baked into the app: a wrong URL here can block
 * updates but can never install unsigned code.
 */

export const UPDATE_ENDPOINT_SETTING_KEY = "updater.endpoint";

export const DEFAULT_UPDATE_ENDPOINTS = [
  "https://www.origai.fr/releases/tutellia/latest.json",
  // Old address, hardcoded in installs up to v2.0.6. Keep as fallback.
  "https://orig-audit.netlify.app/releases/tutellia/latest.json",
] as const;

export function isValidUpdateEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export async function getSavedUpdateEndpoint(): Promise<string | null> {
  const setting = await db.appSetting.findUnique({ where: { key: UPDATE_ENDPOINT_SETTING_KEY } });
  return setting && isValidUpdateEndpoint(setting.value) ? setting.value : null;
}

export async function saveUpdateEndpoint(url: string | null): Promise<void> {
  if (url === null) {
    await db.appSetting.deleteMany({ where: { key: UPDATE_ENDPOINT_SETTING_KEY } });
    return;
  }
  await db.appSetting.upsert({
    where: { key: UPDATE_ENDPOINT_SETTING_KEY },
    create: { key: UPDATE_ENDPOINT_SETTING_KEY, value: url },
    update: { value: url },
  });
}

/** Saved URL first, then defaults, without duplicates. Never throws. */
export async function getUpdateEndpoints(): Promise<string[]> {
  let saved: string | null = null;
  try {
    saved = await getSavedUpdateEndpoint();
  } catch {
    // Database unreachable: the built-in defaults still work.
  }
  return [...new Set([...(saved ? [saved] : []), ...DEFAULT_UPDATE_ENDPOINTS])];
}

export type ManifestCheck =
  | { ok: true; version: string; downloadUrl: string | null }
  | { ok: false; error: string };

/** Fetches a manifest and checks it looks like a Tauri updater latest.json. */
export async function inspectUpdateManifest(url: string): Promise<ManifestCheck> {
  if (!isValidUpdateEndpoint(url)) return { ok: false, error: "L'adresse doit commencer par https://" };
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: `Le serveur a répondu ${res.status}.` };
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return { ok: false, error: "Le fichier n'est pas un manifeste valide." };
    const manifest = body as { version?: unknown; platforms?: Record<string, { url?: unknown }> }; // shape checked below
    if (typeof manifest.version !== "string") return { ok: false, error: "Le manifeste n'indique pas de version." };
    const windowsUrl = manifest.platforms?.["windows-x86_64"]?.url;
    return { ok: true, version: manifest.version, downloadUrl: typeof windowsUrl === "string" ? windowsUrl : null };
  } catch {
    return { ok: false, error: "Adresse injoignable ou réponse illisible." };
  }
}
