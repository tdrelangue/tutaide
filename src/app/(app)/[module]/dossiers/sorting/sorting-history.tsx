"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SortItem } from "./sorting-queue";

interface SortingHistoryProps {
  items: SortItem[];
  isBusy: boolean;
  onUndo: (key: string) => void;
}

/** Files already filed in this session, newest first, each one undoable. */
export function SortingHistory({ items, isBusy, onUndo }: SortingHistoryProps) {
  const placed = items.filter((item) => item.state === "placed" && item.placement).reverse();
  if (placed.length === 0) return null;

  return (
    <section className="border-t pt-3" aria-labelledby="sorting-history-title">
      <h3 id="sorting-history-title" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Déjà rangés ({placed.length})
      </h3>
      <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {placed.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {item.file.name} <span className="text-muted-foreground">→ {item.placement?.dossierName}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0"
              disabled={isBusy}
              onClick={() => onUndo(item.key)}
              aria-label={`Annuler le rangement de ${item.file.name}`}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Annuler
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
