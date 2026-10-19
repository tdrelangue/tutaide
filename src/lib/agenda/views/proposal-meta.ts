import { toValidatedItems } from "../../agenda-engine/domain";
import type { Plan, PlannerState, Question, Unplaced } from "../../agenda-engine/domain";
import type { ProposedPeriod } from "../bridge/ops/week";
import { roundKm } from "./labels";
import type { BentView, PlanSummary, ProblemView, ProposalMeta, QuestionView } from "./types";

/** The panel around a proposal: questions, problems, bent and postponed items. */

export function planSummary(plan: Plan): PlanSummary {
  return { placed: toValidatedItems(plan).length, unplaced: plan.unplaced.length, km: roundKm(plan.totalKm) };
}

function questionView(state: PlannerState, q: Question): QuestionView {
  const respect = planSummary(q.respect);
  const exception = planSummary(q.exception);
  return {
    ruleKey: q.rule.id,
    label: q.rule.label,
    strength: q.rule.strength,
    answer: state.answers[q.rule.id] ?? null,
    respect,
    exception,
    gainKm: roundKm(q.gainKm),
    placesMore: exception.placed - respect.placed,
  };
}

/** Name of what could not be placed: its task, its appointment, or the person whose visits cannot be planned. */
function unplacedTitle(state: PlannerState, u: Unplaced): string {
  if (u.task) return u.task.title;
  const appointment = state.appointments.find((a) => a.id === u.apptId);
  if (appointment) return appointment.title;
  const person = state.contacts.find((c) => c.id === u.personId);
  return person ? `Visite à ${person.name}` : "Rendez-vous";
}

function problemOf(state: PlannerState, u: Unplaced): ProblemView {
  return { title: unplacedTitle(state, u), priority: u.priority, reason: u.reason, lateDays: null, isAlert: u.priority === "MUST" };
}

function problemViews(state: PlannerState, plan: Plan): ProblemView[] {
  const late = plan.late.map((l): ProblemView => ({ title: l.task.title, priority: l.task.priority, reason: "LATE", lateDays: l.days, isAlert: false }));
  return [...plan.unplaced.map((u) => problemOf(state, u)), ...late];
}

function bentViews(plan: Plan): BentView[] {
  return plan.bent.map((b) => ({ ruleKey: b.rule.id, label: b.rule.label, title: b.task.title, date: b.date }));
}

export function buildProposalMeta(state: PlannerState, result: ProposedPeriod): ProposalMeta {
  const { plan, questions } = result.proposal;
  return {
    fingerprint: result.fingerprint,
    placedCount: toValidatedItems(plan).length,
    totalKm: roundKm(plan.totalKm),
    estimatedRouteCount: result.estimated.length,
    questions: questions.map((q) => questionView(state, q)),
    problems: problemViews(state, plan),
    bent: bentViews(plan),
    postponed: plan.postponed.map((t) => ({ title: t.title, due: t.due })),
    softMissed: plan.softMissed.map((m) => ({ label: m.rule.label, date: m.date })),
  };
}
