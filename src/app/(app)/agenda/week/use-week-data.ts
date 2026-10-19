"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgendaDataResult, IsoDate, WeekView } from "@/lib/agenda/views/types";
import { getWeek, proposeWeek } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { addDays, localToday, mondayOf } from "./format";

export type WeekMode = "idle" | "loading" | "proposing";
type LoadKind = "get" | "propose";

/**
 * The week on screen: which Monday, its view (validated plan, maybe a
 * proposal), and the two ways to fetch it. A proposal stays on screen until
 * the week changes; while one is computed, the previous view stays visible.
 * Errors are kept for inline display (useAgendaQuery: no toast).
 */
export function useWeekData(enabled: boolean) {
  const { run, error, issues, clearError } = useAgendaQuery();
  // Only the first request uses the page's clock; « Aujourd'hui » then uses the server's date.
  const [from, setFrom] = useState<IsoDate>(() => mondayOf(localToday()));
  const [view, setView] = useState<WeekView | null>(null);
  const [mode, setMode] = useState<WeekMode>("idle");
  const [lastLoad, setLastLoad] = useState<LoadKind>("get");
  /** Request counter: an answer for a week no longer on screen is dropped. */
  const sequence = useRef(0);

  const fetchInto = useCallback(
    async (kind: LoadKind, action: () => Promise<AgendaDataResult<WeekView>>) => {
      sequence.current += 1;
      const id = sequence.current;
      setMode(kind === "get" ? "loading" : "proposing");
      setLastLoad(kind);
      const data = await run(action);
      if (id !== sequence.current) return;
      if (data) setView(data);
      setMode("idle");
    },
    [run],
  );

  const load = useCallback((weekFrom: IsoDate) => fetchInto("get", () => getWeek(weekFrom)), [fetchInto]);

  const to = view?.to ?? addDays(from, 6);
  const propose = useCallback(() => fetchInto("propose", () => proposeWeek(from, to)), [fetchInto, from, to]);

  useEffect(() => {
    if (enabled) void load(from);
  }, [enabled, from, load]);

  const hasProposal = view?.proposal != null;
  /** After any change: a proposal on screen is recomputed (its fingerprint changed), else the week is read again. */
  const reload = useCallback(() => (hasProposal ? propose() : load(from)), [hasProposal, propose, load, from]);
  const retry = useCallback(() => (lastLoad === "propose" ? propose() : load(from)), [lastLoad, propose, load, from]);

  const goTo = useCallback(
    (weekFrom: IsoDate) => {
      if (weekFrom === from) return;
      sequence.current += 1;
      setView(null);
      setMode("idle");
      clearError();
      setFrom(weekFrom);
    },
    [from, clearError],
  );

  return { from, view, mode, error, issues, load, propose, reload, retry, goTo };
}

export type WeekData = ReturnType<typeof useWeekData>;
