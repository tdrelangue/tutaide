"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileInput, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listOrigPdfInbox,
  readOrigPdfInboxFile,
  removeOrigPdfInboxItem,
  type OrigPdfInboxItem,
} from "@/lib/origpdf";
import { filedInboxEntries } from "@/lib/origpdf-inbox-state";
import type { SortModule } from "./use-sorting-session";

/** Called by the sorting flows: which files they were given, which are still not filed. */
export type SortingSettled = (handled: File[], remaining: File[]) => void;

/**
 * Documents sent from OrigPDF to this module and not filed yet. They are
 * handed to the module's usual sorting (automatic for ASH, by hand for APA
 * and PCH) and leave the inbox only once filed in a dossier.
 */
export function useOrigPdfInbox(moduleType: SortModule) {
  const [items, setItems] = useState<OrigPdfInboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Inbox files handed to a sorting flow, and the entry each came from. Kept
  // until filed: ASH files it cannot recognise go on to sorting by hand.
  const inFlight = useRef(new Map<File, string>());

  const refresh = useCallback(async () => {
    const all = await listOrigPdfInbox();
    setItems(all.filter((item) => item.module === moduleType));
  }, [moduleType]);

  useEffect(() => {
    void refresh();
    function handleFocus() {
      void refresh();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  /** Reads every waiting document and hands them to `start` (the module's sorting). */
  async function sortAll(start: (files: File[]) => void) {
    setIsLoading(true);
    try {
      const files = await Promise.all(items.map(readOrigPdfInboxFile));
      inFlight.current = new Map([...inFlight.current, ...files.map((file, i): [File, string] => [file, items[i]?.id ?? ""])]);
      start(files);
    } catch {
      toast.error("Impossible de lire les documents envoyés depuis OrigPDF");
    } finally {
      setIsLoading(false);
    }
  }

  /** Filed files leave the inbox; the others wait for next time. */
  const settle: SortingSettled = useCallback(
    (handled, remaining) => {
      const { ids, inFlight: next } = filedInboxEntries(inFlight.current, handled, remaining);
      inFlight.current = next;
      void Promise.all(ids.map(removeOrigPdfInboxItem))
        .catch(() => toast.error("Un document rangé est resté dans la liste OrigPDF"))
        .finally(() => void refresh());
    },
    [refresh]
  );

  async function discard(id: string) {
    try {
      await removeOrigPdfInboxItem(id);
    } catch {
      toast.error("Impossible de retirer ce document");
    }
    await refresh();
  }

  return { items, isLoading, sortAll, settle, discard };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/** The banner above the dossier list, only while OrigPDF documents are waiting. */
export function OrigPdfInboxBanner(props: {
  items: OrigPdfInboxItem[];
  isBusy: boolean;
  onSort: () => void;
  onDiscard: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (props.items.length === 0) return null;
  const count = props.items.length;

  return (
    <section aria-label="Documents envoyés depuis OrigPDF" className="mb-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FileInput className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="flex-1 text-sm font-medium" role="status">
          {plural(count, "document")} envoyé{count > 1 ? "s" : ""} depuis OrigPDF {count > 1 ? "attendent" : "attend"} d&apos;être rangé{count > 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={props.onSort} disabled={props.isBusy}>
          {props.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Ranger maintenant
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {props.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 truncate" title={item.name}>{item.name}</span>
            {confirmId === item.id ? (
              <span className="flex items-center gap-1">
                <span>Retirer sans le ranger ?</span>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirmId(null)}>
                  Garder
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => props.onDiscard(item.id)}>
                  Retirer
                </Button>
              </span>
            ) : (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfirmId(item.id)} aria-label={`Retirer ${item.name} de la liste`}>
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
