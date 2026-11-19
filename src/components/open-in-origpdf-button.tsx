"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isOrigPdfInstalled, openInOrigPdf } from "@/lib/origpdf";

/**
 * "Ouvrir dans OrigPDF": the preview here is only for checking; OrigPDF
 * shows the PDF full size and can edit it. Shown only in the desktop app,
 * when OrigPDF is installed on this computer (started if it is closed).
 */
export function OpenInOrigPdfButton({ documentId, filename }: { documentId: string; filename: string }) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    let alive = true;
    void isOrigPdfInstalled().then((installed) => alive && setIsInstalled(installed));
    return () => {
      alive = false;
    };
  }, []);

  async function handleOpen() {
    setIsOpening(true);
    try {
      await openInOrigPdf(`/api/documents/${documentId}/download`, filename);
      toast.success("Ouvert dans OrigPDF");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ouvrir OrigPDF");
    } finally {
      setIsOpening(false);
    }
  }

  if (!isInstalled) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => void handleOpen()} disabled={isOpening}>
      {isOpening ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      Ouvrir dans OrigPDF
    </Button>
  );
}
