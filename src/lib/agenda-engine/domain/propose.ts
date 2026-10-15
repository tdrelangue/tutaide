import type { PlannerContext } from "./context";
import type { IsoDate, PrefDayRule, SlotRule } from "./model";
import { solve, stateRuleOptions, trouble } from "./plan";
import type { Plan, Proposal, Question } from "./planTypes";

/** Breaking an « Important » rule is worth asking about from this many km saved. */
export const STRONG_ASK_KM = 25;

/** « Important » rules that could be broken: day rules and preferred days of active contacts. */
function strongRules(ctx: PlannerContext): (SlotRule | PrefDayRule)[] {
  const days = ctx.state.rules.filter(
    (r) => r.strength === "STRONG" && r.type !== "VACATION",
  );
  const prefs = ctx.state.contacts
    .filter((c) => c.status === "ACTIVE" && c.prefDay?.strength === "STRONG")
    .flatMap((c) => (c.prefDay ? [c.prefDay] : []));
  return [...days, ...prefs];
}

function question(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
  rule: SlotRule | PrefDayRule,
  base: Plan,
): Question | null {
  const exception = solve(ctx, P0, P1, {
    ...stateRuleOptions(ctx),
    relaxed: new Set([rule.id]),
  });
  const gainTrouble = trouble(base) - trouble(exception);
  const gainKm = base.totalKm - exception.totalKm;
  return gainTrouble > 0 || gainKm >= STRONG_ASK_KM
    ? { rule, respect: base, exception, gainKm, gainTrouble }
    : null;
}

/**
 * Proposed plan: every « Important » rule is respected unless the user
 * answered « exception ». For each rule worth breaking, a question shows
 * both plans so the user can compare.
 */
export function propose(
  ctx: PlannerContext,
  P0: IsoDate,
  P1: IsoDate,
): Proposal {
  const base = solve(ctx, P0, P1, stateRuleOptions(ctx));
  const questions = strongRules(ctx)
    .map((r) => question(ctx, P0, P1, r, base))
    .filter((q): q is Question => q !== null);
  const broken = new Set(
    Object.entries(ctx.state.answers)
      .filter(([, a]) => a === "break")
      .map(([id]) => id),
  );
  const plan =
    broken.size > 0
      ? solve(ctx, P0, P1, { ...stateRuleOptions(ctx), relaxed: broken })
      : base;
  return { plan, base, questions };
}
