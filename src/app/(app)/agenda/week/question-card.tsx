"use client";

import { Button } from "@/components/ui/button";
import type { PlanSummary, QuestionView } from "@/lib/agenda/views/types";
import { STRENGTH_LABEL, km, plural } from "./format";

type QuestionCardProps = {
  readonly question: QuestionView;
  readonly busy: boolean;
  readonly onAnswer: (ruleKey: string, answer: "respect" | "break" | null) => void;
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
  function handleRespect() {
    onAnswer(question.ruleKey, "respect");
  }
  function handleBreak() {
    onAnswer(question.ruleKey, "break");
  }
  function handleAskAgain() {
    onAnswer(question.ruleKey, null);
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleRespect} disabled={busy} aria-pressed={question.answer === "respect"}>
          Respecter la règle
        </Button>
        <Button size="sm" variant="outline" onClick={handleBreak} disabled={busy} aria-pressed={question.answer === "break"}>
          Faire une exception
        </Button>
      </div>
      {question.answer !== null && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          Votre choix : {question.answer === "respect" ? "respecter la règle" : "faire une exception"}.
          <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={handleAskAgain} disabled={busy}>
            Me reposer la question
          </Button>
        </p>
      )}
    </div>
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
