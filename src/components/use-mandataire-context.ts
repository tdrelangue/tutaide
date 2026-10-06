"use client";

import { useEffect, useState } from "react";
import { getMandataireContext, type MandataireContext } from "@/lib/access/selection-actions";

const EMPTY: MandataireContext = { choices: [], selection: "all" };

/**
 * The assistant's MJPMs and current choice. For everyone else `choices` is
 * empty and no MJPM picker is shown anywhere.
 */
export function useMandataireContext(enabled = true): MandataireContext {
  const [context, setContext] = useState<MandataireContext>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let isActive = true;
    getMandataireContext()
      .then((next) => isActive && setContext(next))
      .catch(() => isActive && setContext(EMPTY));
    return () => {
      isActive = false;
    };
  }, [enabled]);
  return context;
}
