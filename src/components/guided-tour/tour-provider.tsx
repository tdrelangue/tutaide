"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOURS, type TourId, type TourStep } from "./tours";
import { WelcomeTourDialog } from "./welcome-tour-dialog";

const ELEMENT_WAIT_MS = 4000;

type TourContextValue = { startTour: (id: TourId) => void };

const TourContext = createContext<TourContextValue>({ startTour: () => undefined });

export function useGuidedTour(): TourContextValue {
  return useContext(TourContext);
}

/** Resolves with the step's element once rendered (after navigation), or null. */
function waitForTarget(target: string | undefined): Promise<HTMLElement | null> {
  if (!target) return Promise.resolve(null);
  const selector = `[data-tour="${target}"]`;
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.offsetParent !== null) return resolve(el);
      if (Date.now() - started > ELEMENT_WAIT_MS) return resolve(null);
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

function isOnStepPage(step: TourStep, pathname: string, tabParam: string | null): boolean {
  return pathname === step.path && (!step.tab || tabParam === step.tab);
}

/**
 * Runs the guided tours: opens each step's page, waits for its element and
 * highlights it with driver.js. Also offers the tours once, on first visit.
 */
export function GuidedTourProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [run, setRun] = useState<{ id: TourId; index: number } | null>(null);
  const driverRef = useRef<Driver | null>(null);
  // True while we destroy the highlight ourselves to move to another step.
  const movingRef = useRef(false);

  const clearHighlight = useCallback(() => {
    movingRef.current = true;
    driverRef.current?.destroy();
    driverRef.current = null;
    movingRef.current = false;
  }, []);

  const goTo = useCallback((delta: number) => {
    setRun((current) => {
      if (!current) return null;
      const index = current.index + delta;
      return index >= 0 && index < TOURS[current.id].steps.length ? { ...current, index } : null;
    });
  }, []);

  const startTour = useCallback((id: TourId) => setRun({ id, index: 0 }), []);

  useEffect(() => {
    if (!run) {
      clearHighlight();
      return;
    }
    const steps = TOURS[run.id].steps;
    const step = steps[run.index];
    if (!isOnStepPage(step, pathname, tabParam)) {
      clearHighlight();
      router.push(step.tab ? `${step.path}?tab=${step.tab}` : step.path);
      return;
    }
    let cancelled = false;
    waitForTarget(step.target).then((element) => {
      if (cancelled) return;
      clearHighlight();
      driverRef.current = showStep({ step, index: run.index, total: steps.length, element, goTo, onUserClose: () => setRun(null), movingRef });
    });
    return () => {
      cancelled = true;
    };
  }, [run, pathname, tabParam, router, goTo, clearHighlight]);

  useEffect(() => clearHighlight, [clearHighlight]);

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      <WelcomeTourDialog userId={userId} onStart={startTour} />
    </TourContext.Provider>
  );
}

function showStep(opts: {
  step: TourStep;
  index: number;
  total: number;
  element: HTMLElement | null;
  goTo: (delta: number) => void;
  onUserClose: () => void;
  movingRef: React.MutableRefObject<boolean>;
}): Driver {
  const { step, index, total, element, goTo, onUserClose, movingRef } = opts;
  const isLast = index === total - 1;
  const instance = driver({
    animate: true,
    allowClose: true,
    overlayClickBehavior: "none",
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: "tutellia-tour",
    onNextClick: () => goTo(1),
    onPrevClick: () => goTo(-1),
    // Escape or the close cross: end the tour (not when we move between steps).
    onDestroyed: () => {
      if (!movingRef.current) onUserClose();
    },
  });
  instance.highlight({
    element: element ?? undefined,
    popover: {
      title: step.title,
      description: step.text,
      side: step.side,
      align: "start",
      showButtons: ["next", "previous", "close"],
      disableButtons: index === 0 ? ["previous"] : [],
      showProgress: true,
      progressText: `${index + 1} / ${total}`,
      nextBtnText: isLast ? "Terminer" : "Suivant",
      prevBtnText: "Précédent",
    },
  });
  return instance;
}
