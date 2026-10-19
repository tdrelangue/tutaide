"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AgendaDataResult, EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import { answerQuestion, pinItem, refuseException, skipOccurrence, unpinItem, validateWeek } from "../planning-actions";
import { callAction } from "./call-action";
import { hm } from "./format";
import type { WeekData } from "./use-week-data";

type Done = AgendaDataResult<{ readonly done: true }>;

/**
 * What the user does on the week: pin, unpin, skip, answer, refuse,
 * validate. Each change is followed by a fresh proposal (or a re-read of
 * the week). Validation is only ever triggered by the user's click.
 */
export function useWeekCommands(data: WeekData) {
  const [isActing, setIsActing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

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

  function pin(entry: EntryView, date: IsoDate, start: Minutes) {
    const key = entry.itemKey;
    if (key === null) return;
    void step(() => pinItem(key, date, start), `« ${entry.title} » reste à ${hm(start)}. Le reste se replanifie autour.`);
  }

  function unpin(entry: EntryView) {
    const key = entry.itemKey;
    if (key === null) return;
    void step(() => unpinItem(key), `« ${entry.title} » est rendu au planificateur.`);
  }

  function undoSkip(occurrenceKey: string) {
    void step(() => skipOccurrence(occurrenceKey, false), "La visite est de nouveau proposée.");
  }

  async function skip(entry: EntryView) {
    const key = entry.occurrenceKey;
    if (key === null) return;
    const ok = await step(() => skipOccurrence(key, true), `« ${entry.title} » : pas cette fois.`);
    if (ok) toast("Visite retirée de cette semaine.", { action: { label: "Annuler", onClick: () => undoSkip(key) } });
  }

  function answer(ruleKey: string, value: "respect" | "break" | null) {
    const message = value === null ? "La question vous sera reposée." : "Réponse enregistrée.";
    void step(() => answerQuestion(ruleKey, value), message);
  }

  function refuse(ruleKey: string) {
    void step(() => refuseException(ruleKey, true), "Exception refusée : la règle sera respectée.");
  }

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
    await data.load(view.from);
  }

  function recompute() {
    setValidateError(null);
    void data.propose();
  }

  return { isActing, isValidating, stepError, validateError, pin, unpin, skip, answer, refuse, validate, recompute };
}

export type WeekCommands = ReturnType<typeof useWeekCommands>;
