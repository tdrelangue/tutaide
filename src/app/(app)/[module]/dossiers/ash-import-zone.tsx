"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseAshPdf, findOrCreateAshDossier } from "./document-actions";
import { uploadDocuments } from "./document-actions";

interface AshImportResult {
  filename: string;
  status: "ok" | "error";
  protegeName?: string;
  periodLabel?: string;
  created?: boolean;
  error?: string;
}

export function AshImportZone() {
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AshImportResult[] | null>(null);

  const processFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((f) => f.type === "application/pdf");
      if (pdfs.length === 0) return;

      setIsProcessing(true);
      setResults(null);
      const output: AshImportResult[] = [];

      for (const file of pdfs) {
        // 1. Parse PDF for protégé name + period
        const parseForm = new FormData();
        parseForm.append("file", file);
        const parsed = await parseAshPdf(parseForm);

        if (!parsed.success || !parsed.protegeName) {
          output.push({
            filename: file.name,
            status: "error",
            error: parsed.error ?? "Extraction échouée",
          });
          continue;
        }

        // 2. Find or create the dossier
        const dossierResult = await findOrCreateAshDossier(parsed.protegeName);
        if (!dossierResult.success || !dossierResult.dossierId) {
          output.push({
            filename: file.name,
            status: "error",
            protegeName: parsed.protegeName,
            error: dossierResult.error ?? "Erreur dossier",
          });
          continue;
        }

        // 3. Upload under the generated label
        const labeledFile = new File(
          [file],
          `${parsed.periodLabel ?? parsed.protegeName}.pdf`,
          { type: "application/pdf" }
        );
        const uploadForm = new FormData();
        uploadForm.append("dossierId", dossierResult.dossierId);
        uploadForm.append("files", labeledFile);
        const uploaded = await uploadDocuments(uploadForm);

        if (!uploaded.success) {
          output.push({
            filename: file.name,
            status: "error",
            protegeName: parsed.protegeName,
            error: uploaded.error ?? "Erreur upload",
          });
          continue;
        }

        output.push({
          filename: file.name,
          status: "ok",
          protegeName: parsed.protegeName,
          periodLabel: parsed.periodLabel,
          created: dossierResult.created,
        });
      }

      setResults(output);
      setIsProcessing(false);
      router.refresh();
    },
    [router]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
    },
    [processFiles]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await processFiles(files);
    e.target.value = "";
  };

  const okCount = results?.filter((r) => r.status === "ok").length ?? 0;
  const errCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <Loader2
            className="mx-auto h-8 w-8 text-primary animate-spin mb-2"
            aria-hidden="true"
          />
        ) : (
          <Upload
            className={`mx-auto h-8 w-8 mb-2 ${
              isDragOver ? "text-primary" : "text-muted-foreground"
            }`}
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium">
          {isProcessing
            ? "Traitement en cours…"
            : isDragOver
            ? "Déposez les PDF ASH ici"
            : "Glissez-déposez des PDF ASH"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Le protégé est extrait automatiquement — le dossier est créé si nécessaire
        </p>
        <label>
          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            asChild={false}
            onClick={(e) => {
              e.preventDefault();
              (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
            }}
          >
            Choisir des fichiers
          </Button>
        </label>
      </div>

      {/* Summary */}
      {results && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Résultat : {okCount} importé{okCount !== 1 ? "s" : ""}
            {errCount > 0 && `, ${errCount} échec${errCount !== 1 ? "s" : ""}`}
          </p>
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {r.status === "ok" ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 min-w-0">
                {r.status === "ok" ? (
                  <>
                    <span className="font-medium">{r.periodLabel}</span>
                    {r.created && (
                      <span className="text-muted-foreground ml-1">(dossier créé)</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">{r.filename}</span>
                    {" — "}
                    <span className="text-destructive">{r.error}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
