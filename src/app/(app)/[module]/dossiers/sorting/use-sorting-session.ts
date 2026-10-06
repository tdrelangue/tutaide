"use client";

import { useEffect, useState } from "react";
import {
  deleteDocument,
  listSortingTargets,
  uploadDocuments,
  type SortingTarget,
} from "../document-actions";
import {
  countByState,
  createQueue,
  currentItem,
  markPlaced,
  markSkipped,
  reviewSkipped,
  undoPlacement,
  type SortItem,
} from "./sorting-queue";

export type SortModule = "APA" | "ASH" | "PCH";

/** State and actions of one manual sorting session (one batch of files). */
export function useSortingSession(files: File[], moduleType: SortModule) {
  const [items, setItems] = useState<SortItem[]>(() => createQueue(files));
  const [dossiers, setDossiers] = useState<SortingTarget[]>([]);
  const [pending, setPending] = useState<SortingTarget | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSortingTargets(moduleType)
      .then(setDossiers)
      .catch(() => setError("Impossible de charger la liste des dossiers."));
  }, [moduleType]);

  const current = currentItem(items);

  async function confirm() {
    if (!current || !pending) return;
    setIsBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("dossierId", pending.id);
      form.append("files", current.file);
      const result = await uploadDocuments(form);
      const documentId = result.documents?.[0]?.id;
      if (!result.success || !documentId) {
        setError(result.error ?? "Le fichier n'a pas pu être rangé.");
        return;
      }
      setItems((prev) => markPlaced(prev, current.key, { dossierId: pending.id, dossierName: pending.fullName, documentId }));
      setPending(null);
    } catch {
      setError("Le fichier n'a pas pu être rangé.");
    } finally {
      setIsBusy(false);
    }
  }

  async function undo(key: string) {
    const item = items.find((i) => i.key === key);
    if (!item?.placement) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await deleteDocument(item.placement.documentId);
      if (!result.success) {
        setError(result.error ?? "Impossible d'annuler ce rangement.");
        return;
      }
      setItems((prev) => undoPlacement(prev, key));
      setPending(null);
    } catch {
      setError("Impossible d'annuler ce rangement.");
    } finally {
      setIsBusy(false);
    }
  }

  return {
    items,
    current,
    counts: countByState(items),
    dossiers,
    pending,
    isBusy,
    error,
    choose: (dossier: SortingTarget) => setPending(dossier),
    /** A dossier just created from the sorting screen: list it and propose it. */
    addCreated: (dossier: SortingTarget) => {
      setDossiers((prev) => [...prev, dossier]);
      setPending(dossier);
    },
    cancelChoice: () => setPending(null),
    confirm,
    undo,
    skip: () => current && setItems((prev) => markSkipped(prev, current.key)),
    reviewSkipped: () => setItems(reviewSkipped),
  };
}
