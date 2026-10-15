"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AgendaActionResult } from "./actions";

/**
 * Runs an /agenda action: busy state, outcome, fresh data. The error is also
 * kept in `error` for inline display (a toast is hidden from screen readers
 * behind an open dialog).
 */
export function useAgendaAction() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<AgendaActionResult>): Promise<boolean> {
    setIsBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? "Enregistré");
      router.refresh();
      return true;
    } catch {
      const message = "Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  return { run, isBusy, error, clearError: () => setError(null) };
}
