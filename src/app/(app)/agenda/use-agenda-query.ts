"use client";

import { useCallback, useState } from "react";
import type { AgendaDataResult, IssueView } from "@/lib/agenda/views/types";

const UNEXPECTED = "Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.";

/**
 * Runs an /agenda action that returns data (a week, a preview…). Unlike
 * useAgendaAction it shows no toast and does not refresh the page: the caller
 * renders the data or the error inline (visible to screen readers, also
 * inside dialogs). Returns the data, or null on failure.
 */
export function useAgendaQuery() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly IssueView[]>([]);

  const run = useCallback(async <T,>(action: () => Promise<AgendaDataResult<T>>): Promise<T | null> => {
    setIsBusy(true);
    setError(null);
    setIssues([]);
    try {
      const result = await action();
      if (result.success) return result.data;
      setError(result.error);
      setIssues(result.issues ?? []);
      return null;
    } catch {
      setError(UNEXPECTED);
      return null;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setIssues([]);
  }, []);

  return { run, isBusy, error, issues, clearError };
}
