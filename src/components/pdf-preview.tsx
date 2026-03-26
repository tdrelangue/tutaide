"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, Loader2, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PdfPreviewProps {
  documentId: string;
  filename: string;
  mimeType: string;
}

export function PdfPreview({ documentId, filename, mimeType }: PdfPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label={`Aperçu de ${filename}`}
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
          </DialogHeader>
          {open && (
            <PreviewBody
              documentId={documentId}
              mimeType={mimeType}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewBody({
  documentId,
  mimeType,
}: {
  documentId: string;
  mimeType: string;
}) {
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  if (isPdf) return <PdfRenderer documentId={documentId} />;
  if (isImage) return <ImageRenderer documentId={documentId} />;
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
      Aperçu non disponible pour ce type de fichier.
    </div>
  );
}

// ── Image renderer ──────────────────────────────────────────────────────────

function ImageRenderer({ documentId }: { documentId: string }) {
  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/documents/${documentId}/preview`}
        alt="Aperçu du document"
        className="max-w-full max-h-full object-contain rounded"
      />
    </div>
  );
}

// ── PDF renderer (pdfjs-dist, client-side) ──────────────────────────────────

function PdfRenderer({ documentId }: { documentId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hold the loaded pdf document between page renders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);

  // Load the PDF once on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const pdfjsLib = await import("pdfjs-dist");
        // Worker lives in /public so it's available at this path in both dev and prod
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const url = `/api/documents/${documentId}/preview`;
        const pdf = await pdfjsLib.getDocument(url).promise;

        if (!cancelled) {
          pdfRef.current = pdf;
          setNumPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Impossible de charger le PDF.");
          console.error("[PdfPreview]", e);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [documentId]);

  // Render the current page whenever currentPage or pdf changes
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfRef.current || !canvasRef.current) return;
    try {
      const page = await pdfRef.current.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Scale to fit within 700px width
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(700 / viewport.width, 2);
      const scaled = page.getViewport({ scale });

      canvas.width = scaled.width;
      canvas.height = scaled.height;

      await page.render({ canvasContext: ctx, viewport: scaled }).promise;
    } catch (e) {
      console.error("[PdfPreview] render error", e);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !error && pdfRef.current) {
      renderPage(currentPage);
    }
  }, [currentPage, isLoading, error, renderPage]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-2 text-sm text-muted-foreground">Chargement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 py-12 text-destructive text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 overflow-auto flex justify-center bg-muted/30 p-4 rounded">
        <canvas ref={canvasRef} className="shadow rounded" />
      </div>

      {/* Pagination — only show if more than one page */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-3 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {numPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage === numPages}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
