"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "./actions";

/** Runs a /structure action: busy state, toast with the outcome, fresh data. */
export function useStructureAction() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: () => Promise<ActionResult>, successText?: string): Promise<boolean> {
    setIsBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? successText ?? "Enregistré");
      router.refresh();
      return true;
    } catch {
      toast.error("Erreur inattendue");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  return { run, isBusy };
}
