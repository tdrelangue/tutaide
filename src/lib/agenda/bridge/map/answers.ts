import type { AgendaRuleAnswer } from "@prisma/client";
import type { Answer } from "../../../agenda-engine/domain";

export type MappedAnswers = {
  readonly answers: Readonly<Record<string, Answer>>;
  readonly refusedExceptions: readonly string[];
};

function answerEntries(rows: readonly AgendaRuleAnswer[]): [string, Answer][] {
  return rows.flatMap((r): [string, Answer][] =>
    r.answer === null ? [] : [[r.ruleKey, r.answer === "BREAK" ? "break" : "respect"]],
  );
}

/** « Important » answers and the « Souhaité » exceptions the user refused. */
export function mapAnswers(rows: readonly AgendaRuleAnswer[]): MappedAnswers {
  return {
    answers: Object.fromEntries(answerEntries(rows)),
    refusedExceptions: rows.filter((r) => r.refused).map((r) => r.ruleKey),
  };
}
