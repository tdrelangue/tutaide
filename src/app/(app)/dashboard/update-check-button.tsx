"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkForUpdates, downloadAndInstall } from "@/components/updater";
import type { Update } from "@tauri-apps/plugin-updater";

export function UpdateCheckButton() {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  async function handleCheck() {
    setChecking(true);
    setPendingUpdate(null);
    try {
      const result = await checkForUpdates();
      switch (result.type) {
        case "up-to-date":
          toast.success(`Tutellia v${result.version} est à jour.`);
          break;
        case "available":
          setPendingUpdate(result.update);
          break;
        case "error":
          toast.error(`Erreur de mise à jour : ${result.detail}`);
          break;
        case "not-tauri":
          toast.info("Le vérificateur n'est disponible que dans l'application de bureau.");
          break;
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    if (!pendingUpdate) return;
    setInstalling(true);
    setProgress(0);
    try {
      await downloadAndInstall(pendingUpdate, setProgress);
      // relaunch() is called inside downloadAndInstall — this line won't be reached
    } catch (err) {
      toast.error(`Échec de l'installation : ${err instanceof Error ? err.message : String(err)}`);
      setInstalling(false);
      setProgress(null);
    }
  }

  if (pendingUpdate) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          v{pendingUpdate.version} disponible
        </span>
        <Button
          size="sm"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {progress !== null ? `${progress}%` : "Téléchargement…"}
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Installer
            </>
          )}
        </Button>
        {!installing && (
          <Button variant="ghost" size="sm" onClick={() => setPendingUpdate(null)}>
            Plus tard
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheck}
      disabled={checking}
      aria-label="Vérifier les mises à jour"
    >
      {checking ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      <span className="ml-2">{checking ? "Vérification…" : "Vérifier"}</span>
    </Button>
  );
}
