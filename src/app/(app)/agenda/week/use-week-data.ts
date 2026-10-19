"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgendaDataResult, IsoDate, WeekView } from "@/lib/agenda/views/types";
import { getWeek, proposeWeek } from "../planning-actions";
import { useAgendaQuery, type AgendaQuery } from "../use-agenda-query";
import { addDays, localToday, mondayOf, proposalSummary } from "./format";

export type WeekMode = "idle" | "loading" | "proposing";
type LoadKind = "get" | "propose";
/** "stale": the answer came for a request no longer on screen (dropped). */
export type FetchResult = "ok" | "failed" | "stale";

/**
 * The fetched view and its request counter. Refs mirror the state so async
 * flows (after an await) read what is on screen now, never a stale closure.
 */
function useViewState() {
  const [view, setView] = useState<WeekView | null>(null);
  const viewRef = useRef<WeekView | null>(null);
  const showView = useCallback((next: WeekView | null) => {
    viewRef.current = next;
    setView(next);
  }, []);
  return { view, viewRef, showView };
}

function useWeekFetch(run: AgendaQuery["run"]) {
  const { view, viewRef, showView } = useViewState();
  const [mode, setMode] = useState<WeekMode>("idle");
  const [announcement, setAnnouncement] = useState("");
  const lastLoad = useRef<LoadKind>("get");
  /** Request counter: an answer for a week no longer on screen is dropped. */
  const sequence = useRef(0);

  const fetchInto = useCallback(
    async (kind: LoadKind, action: () => Promise<AgendaDataResult<WeekView>>): Promise<FetchResult> => {
      sequence.current += 1;
      const id = sequence.current;
      const isCurrent = () => id === sequence.current;
      setMode(kind === "get" ? "loading" : "proposing");
      setAnnouncement("");
      lastLoad.current = kind;
      const data = await run(action, { isCurrent });
      if (!isCurrent()) return "stale";
      setMode("idle");
      if (data === null) return "failed";
      showView(data);
      if (kind === "propose" && data.proposal) setAnnouncement(proposalSummary(data.proposal));
      return "ok";
    },
    [run, showView],
  );

  /** Drops the view and any answer still on its way (week change, stale proposal). */
  const dropView = useCallback(() => {
    sequence.current += 1;
    showView(null);
    setMode("idle");
  }, [showView]);

  return { view, mode, announcement, setAnnouncement, viewRef, lastLoad, fetchInto, dropView };
}

/**
 * The week on screen: which Monday, its view (validated plan, maybe a
 * proposal), and the two ways to fetch it. A proposal stays on screen until
 * the week changes; while one is computed, the previous view stays visible.
 * Errors are kept for inline display (useAgendaQuery: no toast).
 */
export function useWeekData(enabled: boolean) {
  const { run, error, issues, clearError } = useAgendaQuery();
  const fetcher = useWeekFetch(run);
  const { viewRef, lastLoad, fetchInto, dropView } = fetcher;
  // Only the first request uses the page's clock; « Aujourd'hui » then uses the server's date.
  const [from, setFrom] = useState<IsoDate>(() => mondayOf(localToday()));
  const fromRef = useRef(from);

  const load = useCallback((weekFrom: IsoDate) => fetchInto("get", () => getWeek(weekFrom)), [fetchInto]);
  const propose = useCallback(() => {
    const weekFrom = fromRef.current;
    const weekTo = viewRef.current?.to ?? addDays(weekFrom, 6);
    return fetchInto("propose", () => proposeWeek(weekFrom, weekTo));
  }, [fetchInto, viewRef]);

  useEffect(() => {
    if (enabled) void load(from);
  }, [enabled, from, load]);

  /** After any change: a proposal on screen is recomputed (its fingerprint changed), else the week is read again. */
  const reload = useCallback(() => (viewRef.current?.proposal != null ? propose() : load(fromRef.current)), [viewRef, propose, load]);
  const retry = useCallback(() => (lastLoad.current === "propose" ? propose() : load(fromRef.current)), [lastLoad, propose, load]);
  const isShowing = useCallback((weekFrom: IsoDate) => fromRef.current === weekFrom, []);

  const goTo = useCallback(
    (weekFrom: IsoDate) => {
      if (weekFrom === fromRef.current) return;
      dropView();
      clearError();
      fromRef.current = weekFrom;
      setFrom(weekFrom);
    },
    [dropView, clearError],
  );

  const { view, mode, announcement, setAnnouncement } = fetcher;
  return { from, view, mode, error, issues, announcement, announce: setAnnouncement, load, propose, reload, retry, goTo, isShowing, dropView };
}

export type WeekData = ReturnType<typeof useWeekData>;
