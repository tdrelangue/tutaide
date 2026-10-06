"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "./actions";

/**
 * Runs a /structure action: busy state, outcome, fresh data.
 * The error is also kept in `error` so dialogs can show it inline
 * (role="alert"): a toast is hidden from screen readers behind an open modal.
 */
export function useStructureAction() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>, successText?: string): Promise<boolean> {
    setIsBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? successText ?? "Enregistré");
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

/** Inline error for dialogs and forms (announced by screen readers). */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
