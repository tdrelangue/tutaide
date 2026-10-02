"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkForUpdatesForce, downloadAndInstall } from "@/components/updater";

export function ForceUpdateButton() {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleForceUpdate() {
    setDownloading(true);
    setProgress(0);
    try {
      const result = await checkForUpdatesForce();
      switch (result.type) {
        case "available":
          await downloadAndInstall(result.update, setProgress);
          // relaunch() is called inside downloadAndInstall — this line won't be reached
          break;
        case "up-to-date":
          toast.info("Aucun artefact publié à l'endpoint de mise à jour.");
          setDownloading(false);
          setProgress(null);
          break;
        case "error":
          toast.error(`Erreur : ${result.detail}`);
          setDownloading(false);
          setProgress(null);
          break;
        case "not-tauri":
          toast.info("Disponible uniquement dans l'application de bureau.");
          setDownloading(false);
          setProgress(null);
          break;
      }
    } catch (err) {
      toast.error(`Échec : ${err instanceof Error ? err.message : String(err)}`);
      setDownloading(false);
      setProgress(null);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleForceUpdate}
      disabled={downloading}
      aria-label="Forcer le retéléchargement de la version publiée (admin)"
      title="Retélécharge et réinstalle l'artefact publié, même si la version est identique. Réservé aux tests admin."
    >
      {downloading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {progress !== null ? `${progress}%` : "Téléchargement…"}
        </>
      ) : (
        <>
          <ShieldAlert className="h-4 w-4 mr-2" />
          Forcer le retéléchargement
        </>
      )}
    </Button>
  );
}
