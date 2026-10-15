import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  availWindows,
  createContext,
  isoDow,
  propose,
  solve,
} from "../../domain";
import type {
  Contact,
  IsoDow,
  Plan,
  PlannerContext,
  Priority,
  SlotRule,
} from "../../domain";
import { H, MON, appt, place, protege, state } from "./fixtures";
import { benchmarkState } from "./scenario";

const TO = "2026-11-01";
type Infer<A> = A extends fc.Arbitrary<infer T> ? T : never;
const PRIORITIES: readonly Priority[] = ["LOW", "NORMAL", "HIGH", "MUST"];

const personArb = fc.record({
  lat: fc.double({ min: 44.95, max: 45.55, noNaN: true }),
  lon: fc.double({ min: 1.25, max: 2.3, noNaN: true }),
  lastOffset: fc.integer({ min: 0, max: 120 }),
  period: fc.constantFrom(
    "WEEK" as const,
    "MONTH" as const,
    "QUARTER" as const,
  ),
  priority: fc.constantFrom(...PRIORITIES),
  notBefore: fc.option(fc.integer({ min: 9, max: 14 }), { nil: undefined }),
});
const ruleArb = fc.record({
  dow: fc.integer({ min: 1, max: 5 }),
  kind: fc.constantFrom("allDay" as const, "hours" as const, "cap" as const),
  strength: fc.constantFrom(
    "HARD" as const,
    "STRONG" as const,
    "MEDIUM" as const,
    "SOFT" as const,
  ),
  from: fc.integer({ min: 8, max: 15 }),
  max: fc.integer({ min: 0, max: 3 }),
});
const fixedArb = fc.record({
  day: fc.integer({ min: 0, max: 13 }),
  hour: fc.integer({ min: 8, max: 17 }),
});

function toRule(r: Infer<typeof ruleArb>, i: number): SlotRule {
  const base = {
    id: `r${i}`,
    label: `r${i}`,
    dow: r.dow as IsoDow,
    strength: r.strength,
  }; // dow drawn in 1..5
  if (r.kind === "cap") return { ...base, type: "MAX_VISITS", max: r.max };
  if (r.kind === "allDay")
    return { ...base, type: "UNAVAILABLE", allDay: true };
  return {
    ...base,
    type: "UNAVAILABLE",
    allDay: false,
    from: H(r.from),
    to: H(r.from + 2),
    atOffice: i % 2 === 0,
  };
}

function toPerson(p: Infer<typeof personArb>, i: number): Contact {
  const last = new Date(Date.UTC(2026, 9, 19) - p.lastOffset * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return protege(`p${i}`, `Personne ${i}`, {
    at: place(`h${i}`, p.lat, p.lon),
    last,
    period: p.period,
    priority: p.priority,
    ...(p.notBefore === undefined ? {} : { notBefore: H(p.notBefore) }),
  });
}

const scenarioArb = fc.record({
  people: fc.array(personArb, { minLength: 1, maxLength: 14 }),
  rules: fc.array(ruleArb, { maxLength: 4 }),
  fixed: fc.array(fixedArb, { maxLength: 4 }),
});

function buildCtx(s: Infer<typeof scenarioArb>): PlannerContext {
  const fixedDate = (d: number) =>
    new Date(Date.UTC(2026, 9, 19 + d)).toISOString().slice(0, 10);
  return createContext(
    state({
      contacts: s.people.map(toPerson),
      rules: s.rules.map(toRule),
      appointments: s.fixed.map((f, i) =>
        appt(`f${i}`, {
          kind: "FIXED",
          date: fixedDate(f.day),
          time: H(f.hour),
        }),
      ),
    }),
  );
}

function checkPlan(
  ctx: PlannerContext,
  plan: Plan,
  relaxed: ReadonlySet<string>,
) {
  const hard = ctx.state.rules.filter(
    (r) =>
      r.strength === "HARD" || (r.strength === "STRONG" && !relaxed.has(r.id)),
  );
  for (const day of plan.days) {
    const spans = [
      ...day.items.map((i) => [i.start, i.end] as const),
      ...day.blocks.map((b) => [b.s, b.e] as const),
    ].sort((a, b) => a[0] - b[0]);
    day.items.forEach((i) => {
      // No item overlaps another item or any block of the day.
      expect(spans.filter(([s, e]) => s < i.end && i.start < e)).toHaveLength(
        1,
      );
      expect(i.start).toBeGreaterThanOrEqual(ctx.state.settings.dayStart);
      expect(i.end).toBeLessThanOrEqual(ctx.state.settings.dayEnd);
      expect(
        availWindows(ctx, i.task, day.date).some(
          ([s, e]) => s <= i.start && i.end <= e,
        ),
      ).toBe(true);
    });
    for (const r of hard.filter(
      (x) => "dow" in x && x.dow === isoDow(day.date),
    )) {
      if (r.type === "UNAVAILABLE" && r.allDay) expect(day.items).toEqual([]);
      if (r.type === "MAX_VISITS")
        expect(
          day.items.length +
            day.blocks.filter((b) => b.kind === "event").length,
        ).toBeLessThanOrEqual(
          Math.max(r.max, day.blocks.filter((b) => b.kind === "event").length),
        );
    }
  }
}

describe("properties on random data", () => {
  it("never overlaps two items and never breaks an imperative rule", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const ctx = buildCtx(s);
        checkPlan(ctx, solve(ctx, MON, TO), new Set());
      }),
      { numRuns: 60, seed: 20261014 },
    );
  });

  it("keeps « Important » rules unless answered, and stays deterministic", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const ctx = buildCtx(s);
        const first = propose(ctx, MON, TO);
        checkPlan(ctx, first.plan, new Set());
        for (const q of first.questions)
          checkPlan(ctx, q.exception, new Set([q.rule.id]));
        expect(propose(ctx, MON, TO)).toEqual(first);
      }),
      { numRuns: 25, seed: 7 },
    );
  });
});

describe("performance budget", () => {
  it("plans 4 weeks, 60 people and 30 appointments in under 300 ms", () => {
    const ctx = createContext(benchmarkState());
    propose(ctx, MON, "2026-11-15"); // warm-up (JIT)
    const t0 = performance.now();
    const { plan } = propose(ctx, MON, "2026-11-15");
    const ms = performance.now() - t0;
    expect(plan.days.filter((d) => !d.offDay)).toHaveLength(20);
    expect(
      plan.days.reduce((n, d) => n + d.items.length, 0),
    ).toBeGreaterThanOrEqual(40);
    expect(ms).toBeLessThan(300);
  });
});
