"use client";

import { useCallback, useRef, useState } from "react";
import type { AgendaDataResult, IssueView } from "@/lib/agenda/views/types";

const UNEXPECTED = "Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.";

export type RunOptions = {
  /** Caller-side staleness (e.g. the week changed): when false, the answer is dropped. */
  readonly isCurrent?: () => boolean;
};

/**
 * Runs an /agenda action that returns data (a week, a preview…). Unlike
 * useAgendaAction it shows no toast and does not refresh the page: the caller
 * renders the data or the error inline (visible to screen readers, also
 * inside dialogs). Returns the data, or null on failure.
 *
 * Only the latest request counts: an answer superseded by a newer `run` (or
 * no longer current per `isCurrent`) returns null and touches no state, and
 * `isBusy` follows the latest request only.
 */
export function useAgendaQuery() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly IssueView[]>([]);
  const latest = useRef(0);

  const run = useCallback(async <T,>(action: () => Promise<AgendaDataResult<T>>, options: RunOptions = {}): Promise<T | null> => {
    latest.current += 1;
    const id = latest.current;
    const isCurrent = () => id === latest.current && (options.isCurrent?.() ?? true);
    setIsBusy(true);
    setError(null);
    setIssues([]);
    try {
      const result = await action();
      if (!isCurrent()) return null;
      if (result.success) return result.data;
      setError(result.error);
      setIssues(result.issues ?? []);
      return null;
    } catch {
      if (isCurrent()) setError(UNEXPECTED);
      return null;
    } finally {
      if (id === latest.current) setIsBusy(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setIssues([]);
  }, []);

  return { run, isBusy, error, issues, clearError };
}

export type AgendaQuery = ReturnType<typeof useAgendaQuery>;
