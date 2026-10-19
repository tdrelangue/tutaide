import { addDays } from "@/lib/agenda-engine/domain";
import type { PlannerState, ValidatedItem } from "@/lib/agenda-engine/domain";
import type { BridgeIssue } from "../issues";
import { loadPlannerState } from "../load";
import { parsePeriod } from "../period";
import type { Period } from "../period";
import { CONFIRM_WINDOW_DAYS } from "./missed";
import { proposePeriod } from "./plan";
import type { PlanDeps, ProposeResult } from "./plan";

/** The proposal of a period, when it succeeded. */
export type ProposedPeriod = Extract<ProposeResult, { ok: true }>;

export type WeekRead =
  | { readonly ok: false; readonly reason: "INVALID_INPUT" | "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] }
  | {
      readonly ok: true;
      /** The planning as stored: validated and past items, settings, contacts, today. */
      readonly state: PlannerState;
      /** Null without `withProposal`. */
      readonly proposal: ProposedPeriod | null;
      readonly issues: readonly BridgeIssue[];
    };

/**
 * What the week screen needs. Without a proposal this only reads the stored
 * planning: IGN is never called, so road times (km, return time) are unknown
 * and left out rather than shown as straight-line figures that would not match
 * the proposal. With a proposal, the plan is computed as proposePeriod does
 * (road times asked to IGN, or estimated). Never writes anything.
 */
export async function readWeek(ownerId: string, rawPeriod: Period, deps: PlanDeps, withProposal: boolean): Promise<WeekRead> {
  const period = parsePeriod(rawPeriod);
  if (period === null) return { ok: false, reason: "INVALID_INPUT", issues: [] };
  if (!withProposal) {
    const loaded = await loadPlannerState(ownerId, deps.now);
    if (!loaded.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: loaded.issues };
    return { ok: true, state: loaded.state, proposal: null, issues: loaded.issues };
  }
  const proposed = await proposePeriod(ownerId, period, deps);
  if (!proposed.ok) return { ok: false, reason: proposed.reason, issues: proposed.issues };
  const loaded = await loadPlannerState(ownerId, deps.now);
  if (!loaded.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: loaded.issues };
  return { ok: true, state: loaded.state, proposal: proposed, issues: proposed.issues };
}

export type ConfirmationsRead =
  | { readonly ok: false; readonly issues: readonly BridgeIssue[] }
  | { readonly ok: true; readonly state: PlannerState; readonly items: readonly ValidatedItem[] };

/** « Ces rendez-vous ont-ils eu lieu ? »: validated items of the last days, with the state to name their participants. */
export async function readConfirmations(ownerId: string, now: Date): Promise<ConfirmationsRead> {
  const loaded = await loadPlannerState(ownerId, now);
  if (!loaded.ok) return { ok: false, issues: loaded.issues };
  const { state } = loaded;
  const from = addDays(state.today, -CONFIRM_WINDOW_DAYS);
  const items = state.validated.filter((v) => v.date >= from && v.date <= state.today);
  return { ok: true, state, items };
}
