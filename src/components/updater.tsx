"use client";

import { useEffect, useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { getUpdateEndpointsAction } from "@/lib/update-actions";

type UpdateMetadata = ConstructorParameters<typeof Update>[0];

/**
 * Checks the update URLs from the database (admin-editable) via the
 * check_for_update Rust command. Falls back to the plugin's built-in check
 * (endpoints from tauri.conf.json) if that path fails for any reason.
 */
async function findUpdate(allowDowngrades: boolean): Promise<Update | null> {
  try {
    const endpoints = await getUpdateEndpointsAction();
    const metadata = await invoke<UpdateMetadata | null>("check_for_update", { endpoints, allowDowngrades });
    return metadata ? new Update(metadata) : null;
  } catch {
    return check(allowDowngrades ? { allowDowngrades: true } : undefined);
  }
}

// ─── Download + install (no dialog — caller handles confirmation) ─────────────

export async function downloadAndInstall(
  update: Update,
  onProgress?: (pct: number) => void
): Promise<void> {
  let downloaded = 0;
  let total = 0;

  await invoke("kill_server");

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        if (total > 0 && onProgress) {
          onProgress(Math.round((downloaded / total) * 100));
        }
        break;
    }
  });

  await relaunch();
}

// ─── Manual check — returns result, no dialogs ───────────────────────────────

export type UpdateCheckResult =
  | { type: "up-to-date"; version: string }
  | { type: "available"; update: Update }
  | { type: "error"; detail: string }
  | { type: "not-tauri" };

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!(await isTauri())) {
    return { type: "not-tauri" };
  }
  try {
    const update = await findUpdate(false);
    if (!update) {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();
      return { type: "up-to-date", version };
    }
    return { type: "available", update };
  } catch (err) {
    return { type: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Same as checkForUpdates, but with allowDowngrades so the artifact at the
 * update endpoint is always returned — even if its version is equal to or
 * lower than the running app. Lets admins re-test the updater against the
 * exact build currently published, without faking an older local version.
 */
export async function checkForUpdatesForce(): Promise<UpdateCheckResult> {
  if (!(await isTauri())) {
    return { type: "not-tauri" };
  }
  try {
    const update = await findUpdate(true);
    if (!update) {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();
      return { type: "up-to-date", version };
    }
    return { type: "available", update };
  } catch (err) {
    return { type: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Silent startup checker ───────────────────────────────────────────────────

export function UpdaterStartupCheck() {
  const [ran, setRan] = useState(false);

  const silentCheck = useCallback(async () => {
    if (ran) return;
    setRan(true);

    if (!(await isTauri())) return;

    try {
      const update = await findUpdate(false);
      if (!update) return;

      toast.info(`Mise à jour disponible : v${update.version}`, {
        description: "Rendez-vous sur le tableau de bord pour l'installer.",
        duration: 8000,
      });
    } catch {
      // Silently ignore startup failures
    }
  }, [ran]);

  useEffect(() => {
    const timer = setTimeout(silentCheck, 3000);
    return () => clearTimeout(timer);
  }, [silentCheck]);

  return null;
}
