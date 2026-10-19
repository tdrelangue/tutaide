"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { PlanSummary, QuestionView } from "@/lib/agenda/views/types";
import { BusyButton } from "./busy-button";
import { STRENGTH_LABEL, km, plural } from "./format";

type Answer = "respect" | "break" | null;

type QuestionCardProps = {
  readonly question: QuestionView;
  readonly busy: boolean;
  readonly onAnswer: (ruleKey: string, answer: Answer) => void;
};

function gainText(question: QuestionView): string {
  const parts = [
    question.placesMore > 0 ? `place ${plural(question.placesMore, "rendez-vous", "rendez-vous")} de plus` : null,
    question.gainKm >= 1 ? `économise ${km(question.gainKm)}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? `Y déroger ${parts.join(" et ")}.` : "Les deux plans sont proches.";
}

/** « Important » rule: both plans side by side, the user chooses. Respecting the rule is the prominent, safe path. */
export function QuestionCard({ question, busy, onAnswer }: QuestionCardProps) {
  const respectRef = useRef<HTMLButtonElement>(null);
  const askedAgain = useRef(false);

  // « Me reposer la question » disappears once the answer is cleared: focus goes to the first choice.
  useEffect(() => {
    if (!askedAgain.current || question.answer !== null) return;
    askedAgain.current = false;
    respectRef.current?.focus();
  }, [question.answer]);

  function handleAnswer(answer: Answer) {
    askedAgain.current = answer === null;
    onAnswer(question.ruleKey, answer);
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-background p-3">
      <div>
        <p className="text-sm font-semibold">« {question.label} »</p>
        <p className="text-xs text-muted-foreground">
          Règle {STRENGTH_LABEL[question.strength]} : Tutellia vous demande avant d&apos;y déroger. {gainText(question)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <PlanColumn title="Respecter la règle" plan={question.respect} />
        <PlanColumn title="Faire une exception" plan={question.exception} />
      </dl>
      <AnswerButtons answer={question.answer} busy={busy} respectRef={respectRef} onAnswer={handleAnswer} />
    </div>
  );
}

type AnswerButtonsProps = {
  readonly answer: Answer;
  readonly busy: boolean;
  readonly respectRef: RefObject<HTMLButtonElement | null>;
  readonly onAnswer: (answer: Answer) => void;
};

function AnswerButtons({ answer, busy, respectRef, onAnswer }: AnswerButtonsProps) {
  function handleRespect() {
    onAnswer("respect");
  }
  function handleBreak() {
    onAnswer("break");
  }
  function handleAskAgain() {
    onAnswer(null);
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <BusyButton ref={respectRef} size="sm" onClick={handleRespect} busy={busy} aria-pressed={answer === "respect"}>
          Respecter la règle
        </BusyButton>
        <BusyButton size="sm" variant="outline" onClick={handleBreak} busy={busy} aria-pressed={answer === "break"}>
          Faire une exception
        </BusyButton>
      </div>
      {answer !== null && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          Votre choix : {answer === "respect" ? "respecter la règle" : "faire une exception"}.
          {/* min-h-6: a ≥ 24 px target (WCAG 2.5.8). */}
          <BusyButton size="sm" variant="link" className="h-auto min-h-6 p-0 text-xs" onClick={handleAskAgain} busy={busy}>
            Me reposer la question
          </BusyButton>
        </p>
      )}
    </>
  );
}

function PlanColumn({ title, plan }: { title: string; plan: PlanSummary }) {
  return (
    <div className="rounded border bg-muted/40 p-2">
      <dt className="font-semibold">{title}</dt>
      <dd>{plural(plan.placed, "placé", "placés")}</dd>
      <dd>{plural(plan.unplaced, "non placé", "non placés")}</dd>
      <dd>{km(plan.km)}</dd>
    </div>
  );
}
