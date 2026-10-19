"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AgendaDataResult, EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import { answerQuestion, pinItem, refuseException, skipOccurrence, unpinItem, validateWeek } from "../planning-actions";
import { callAction } from "./call-action";
import { hm } from "./format";
import type { WeekData } from "./use-week-data";

type Done = AgendaDataResult<{ readonly done: true }>;

/** Where focus goes when the control the user acted on disappears (WCAG 2.4.3). */
export type FocusTargets = {
  /** The week heading. */
  readonly week: () => void;
  /** The « Proposition » panel title. */
  readonly proposal: () => void;
};

/** One change, then fresh data. `data.reload` reads the week on screen now (refs), not when the click happened. */
function useStep(data: WeekData) {
  const [isActing, setIsActing] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  async function step(action: () => Promise<Done>, success: string): Promise<boolean> {
    setIsActing(true);
    setStepError(null);
    const outcome = await callAction(action);
    setIsActing(false);
    if (!outcome.ok) {
      setStepError(outcome.error);
      toast.error(outcome.error);
      return false;
    }
    toast.success(success);
    await data.reload();
    return true;
  }

  return { isActing, stepError, step };
}

/** Validation: only ever triggered by the user's click, on the proposal they saw (its fingerprint). */
function useValidate(data: WeekData, focus: FocusTargets) {
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  async function validate() {
    const view = data.view;
    const fingerprint = view?.proposal?.fingerprint;
    if (!view || !fingerprint) return;
    setIsValidating(true);
    setValidateError(null);
    const outcome = await callAction(() => validateWeek(view.from, view.to, fingerprint));
    setIsValidating(false);
    if (!outcome.ok) {
      setValidateError(outcome.error);
      return;
    }
    toast.success("Semaine validée : c'est maintenant votre planning.");
    if (!data.isShowing(view.from)) return;
    const result = await data.load(view.from);
    // The proposal on screen is validated already: never leave it offered again; the load error shows instead.
    if (result === "failed") data.dropView();
    if (result === "ok") data.announce("Semaine validée : c'est maintenant votre planning.");
    focus.week();
  }

  function recompute() {
    setValidateError(null);
    void data.propose();
  }

  return { isValidating, validateError, validate, recompute };
}

/**
 * What the user does on the week: pin, unpin, skip, answer, refuse,
 * validate. Each change is followed by a fresh proposal (or a re-read of
 * the week).
 */
export function useWeekCommands(data: WeekData, focus: FocusTargets) {
  const { isActing, stepError, step } = useStep(data);
  const validation = useValidate(data, focus);

  function pin(entry: EntryView, date: IsoDate, start: Minutes) {
    const key = entry.itemKey;
    if (key !== null) void step(() => pinItem(key, date, start), `« ${entry.title} » reste à ${hm(start)}. Le reste se replanifie autour.`);
  }
  async function unpin(entry: EntryView) {
    const key = entry.itemKey;
    if (key !== null && (await step(() => unpinItem(key), `« ${entry.title} » est rendu au planificateur.`))) focus.week();
  }
  function undoSkip(occurrenceKey: string) {
    void step(() => skipOccurrence(occurrenceKey, false), "La visite est de nouveau proposée.");
  }
  async function skip(entry: EntryView) {
    const key = entry.occurrenceKey;
    if (key === null || !(await step(() => skipOccurrence(key, true), `« ${entry.title} » : pas cette fois.`))) return;
    focus.week();
    toast("Visite retirée de cette semaine.", { action: { label: "Annuler", onClick: () => undoSkip(key) } });
  }
  function answer(ruleKey: string, value: "respect" | "break" | null) {
    void step(() => answerQuestion(ruleKey, value), value === null ? "La question vous sera reposée." : "Réponse enregistrée.");
  }
  async function refuse(ruleKey: string) {
    if (await step(() => refuseException(ruleKey, true), "Exception refusée : la règle sera respectée.")) focus.proposal();
  }

  return { isActing, stepError, ...validation, pin, unpin, skip, answer, refuse };
}

export type WeekCommands = ReturnType<typeof useWeekCommands>;
