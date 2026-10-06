"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SortingDialog } from "./sorting-dialog";
import type { SortModule } from "./use-sorting-session";

const SORTABLE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);

export const SORTABLE_ACCEPT = ".pdf,.png,.jpg,.jpeg";

/** Keeps only the files the sorting screen can file (PDF and images). */
export function sortableFiles(files: File[]): File[] {
  return files.filter((file) => SORTABLE_TYPES.has(file.type));
}

/**
 * Opens the sorting screen for a batch of files. Returns `start(files)` and
 * the dialog element to render. Each batch gets a fresh session.
 */
export function useSortingLauncher(moduleType: SortModule) {
  const router = useRouter();
  const [batch, setBatch] = useState<{ id: number; files: File[] } | null>(null);

  function start(files: File[]) {
    const accepted = sortableFiles(files);
    if (accepted.length > 0) setBatch({ id: Date.now(), files: accepted });
  }

  // Unfiled files are still on the user's computer; nothing to keep here.
  function handleClose() {
    setBatch(null);
    router.refresh();
  }

  const dialog = batch ? (
    <SortingDialog key={batch.id} open files={batch.files} moduleType={moduleType} onClose={handleClose} />
  ) : null;

  return { start, dialog };
}
