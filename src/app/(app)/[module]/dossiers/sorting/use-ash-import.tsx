"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findOrCreateAshDossier, parseAshPdf, uploadDocuments } from "../document-actions";
import { SortingDialog } from "./sorting-dialog";
import { sortableFiles } from "./use-sorting-launcher";
import { useAshOwnerPrompt } from "./ash-owner-prompt";
import { useMandataireContext } from "@/components/use-mandataire-context";

/** Asks which MJPM a new dossier is for; null = do not create. */
type AskOwner = (protegeName: string) => Promise<string | null>;

/** Finds the dossier, or creates it (asking an assistant for the MJPM when needed). */
async function findOrCreateWithOwner(protegeName: string, askOwner: AskOwner) {
  const first = await findOrCreateAshDossier(protegeName);
  if (!first.needsOwner) return first;
  const ownerId = await askOwner(protegeName);
  if (!ownerId) return { success: false, error: "Mandataire non choisi : à ranger à la main" };
  return findOrCreateAshDossier(protegeName, ownerId);
}

export interface AshImportResult {
  filename: string;
  status: "ok" | "error";
  protegeName?: string;
  periodLabel?: string;
  created?: boolean;
  error?: string;
}

/**
 * ASH automatic import of one PDF: reads the protégé's name, finds the dossier
 * (or creates it, by design), then files the PDF under its period label.
 */
async function importAshPdf(file: File, askOwner: AskOwner): Promise<AshImportResult> {
  const parseForm = new FormData();
  parseForm.append("file", file);
  const parsed = await parseAshPdf(parseForm);
  if (!parsed.success || !parsed.protegeName) {
    return { filename: file.name, status: "error", error: parsed.error ?? "Extraction échouée" };
  }

  const protegeName = parsed.protegeName;
  const dossier = await findOrCreateWithOwner(protegeName, askOwner);
  if (!dossier.success || !dossier.dossierId) {
    return { filename: file.name, status: "error", protegeName, error: dossier.error ?? "Erreur dossier" };
  }

  const labeled = new File([file], `${parsed.periodLabel ?? protegeName}.pdf`, { type: "application/pdf" });
  const uploadForm = new FormData();
  uploadForm.append("dossierId", dossier.dossierId);
  uploadForm.append("files", labeled);
  const uploaded = await uploadDocuments(uploadForm);
  if (!uploaded.success) {
    return { filename: file.name, status: "error", protegeName, error: uploaded.error ?? "Erreur upload" };
  }
  return { filename: file.name, status: "ok", protegeName, periodLabel: parsed.periodLabel, created: "created" in dossier ? dossier.created : false };
}

/** Runs the ASH import on dropped files; what it cannot place goes to manual sorting. */
export function useAshImport() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AshImportResult[] | null>(null);
  const [unsorted, setUnsorted] = useState<File[]>([]);
  const [sortingBatch, setSortingBatch] = useState<number | null>(null);
  // Set synchronously, unlike isProcessing: a double-click or a second drop
  // before the next render must not import the same files twice.
  const runningRef = useRef(false);
  const ownerPrompt = useAshOwnerPrompt(useMandataireContext().choices);

  async function start(files: File[]) {
    if (runningRef.current) return;
    const accepted = sortableFiles(files);
    const pdfs = accepted.filter((f) => f.type === "application/pdf");
    // Images cannot be read automatically: they go straight to manual sorting.
    const images = accepted.filter((f) => f.type !== "application/pdf");
    if (accepted.length === 0) return;
    runningRef.current = true;
    ownerPrompt.resetForNewDrop();
    setIsProcessing(true);
    setResults(null);
    const output: AshImportResult[] = images.map((f) => ({
      filename: f.name,
      status: "error" as const,
      error: "Image : à ranger à la main",
    }));
    const failed: File[] = [...images];
    try {
      for (const file of pdfs) {
        const result = await importAshPdf(file, ownerPrompt.ask).catch(
          (): AshImportResult => ({ filename: file.name, status: "error", error: "Erreur inattendue" })
        );
        output.push(result);
        if (result.status === "error") failed.push(file);
      }
    } finally {
      runningRef.current = false;
      setResults(output);
      setUnsorted(failed);
      setIsProcessing(false);
      router.refresh();
    }
  }

  function handleSortingClose(remaining: File[]) {
    setSortingBatch(null);
    setUnsorted(remaining);
    router.refresh();
  }

  const dialog = (
    <>
      {ownerPrompt.dialog}
      {sortingBatch !== null && (
        <SortingDialog key={sortingBatch} open files={unsorted} moduleType="ASH" onClose={handleSortingClose} />
      )}
    </>
  );

  return { start, isProcessing, results, unsorted, openSorting: () => setSortingBatch(Date.now()), dialog };
}
