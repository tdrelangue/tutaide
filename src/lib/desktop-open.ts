"use client";

/**
 * Inside the Tutellia desktop app: downloads a document with the user's
 * session, then asks the app to save it to Downloads and open it with the
 * default program (macOS webviews ignore downloads and window.open).
 * Returns false outside the desktop app, or when it could not be done.
 */
export async function openWithDesktopApp(url: string, filename: string): Promise<boolean> {
  const { isTauri, invoke } = await import("@tauri-apps/api/core");
  if (!isTauri()) return false;
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Raw body (no JSON) for speed; the name travels percent-encoded (ASCII header).
    await invoke("save_and_open", bytes, { headers: { "x-filename": encodeURIComponent(filename) } });
    return true;
  } catch {
    return false;
  }
}

/** Desktop app only: back to the start-up screen to choose the connection. */
export async function openConnectionSettings(): Promise<boolean> {
  const { isTauri, invoke } = await import("@tauri-apps/api/core");
  if (!isTauri()) return false;
  await invoke("open_connection_settings");
  return true;
}

export type DesktopConnection = { mode: "local" | "server"; url: string | null; appVersion: string };

/** Desktop app only: how this app is connected (null in a plain browser). */
export async function getDesktopConnection(): Promise<DesktopConnection | null> {
  const { isTauri, invoke } = await import("@tauri-apps/api/core");
  if (!isTauri()) return null;
  try {
    return await invoke<DesktopConnection>("get_connection");
  } catch {
    return null;
  }
}
