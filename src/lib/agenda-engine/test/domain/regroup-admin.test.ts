// Thomas, 2026-11-03: first visits spread by town, a day draws its area, people offered in advance, admin time kept.
import { describe, expect, it } from "vitest";
import { buildTasks, createContext, freshWeeks, solve } from "../../domain";
import type { Contact, Place } from "../../domain";
import { FRI, H, MON, place, protege, settings, state } from "./fixtures";

const at = (id: string, lat: number, lon: number, town: string): Place => ({ ...place(id, lat, lon), address: `1 rue ${id} ${town}` });
const TULLE = (i: number) => at(`tulle${i}`, 45.2675 + i * 0.001, 1.7716, "19000 Tulle");
const NAVES = at("naves", 45.3133, 1.7671, "19460 Naves");
const OBJAT = (i: number) => at(`objat${i}`, 45.2626 + i * 0.001, 1.4083, "19130 Objat");

/** Never seen, last visit unknown, added on Monday 19. */
function fresh(id: string, where: Place): Contact {
  const p = protege(id, id, { at: where, last: MON, period: "QUARTER" });
  return { ...p, visits: p.visits && { ...p.visits, startedOn: MON } };
}

describe("a caseload entered at once is spread from the start", () => {
  it("one town shares a week; the towns spread over the quarter", () => {
    const contacts = [fresh("t1", TULLE(1)), fresh("t2", TULLE(2)), fresh("o1", OBJAT(1)), fresh("o2", OBJAT(2))];
    const weeks = freshWeeks(createContext(state({ contacts })));
    expect(weeks.get("t1")).toBe(weeks.get("t2"));
    expect(weeks.get("o1")).toBe(weeks.get("o2"));
    expect(weeks.get("t1")).not.toBe(weeks.get("o1"));
  });

  it("a big town is cut in packs of 8 a week", () => {
    const contacts = Array.from({ length: 10 }, (_, i) => fresh(`t${String(i).padStart(2, "0")}`, TULLE(i)));
    const weeks = freshWeeks(createContext(state({ contacts })));
    expect(new Set([...weeks.values()]).size).toBe(2);
  });

  it("the week of a fresh start never holds the whole caseload", () => {
    const contacts = Array.from({ length: 30 }, (_, i) => fresh(`p${i}`, at(`p${i}`, 45.1 + i * 0.01, 1.5 + (i % 5) * 0.05, `191${String(i % 10).padStart(2, "0")} Ville${i % 10}`)));
    const { tasks } = buildTasks(createContext(state({ contacts })), MON, FRI, new Set());
    const thisWeek = tasks.filter((t) => t.earliest <= FRI);
    expect(thisWeek.length).toBeLessThan(contacts.length / 2);
  });
});

describe("a day in a town draws its area", () => {
  it("Tulle due on Monday and Thursday: seen the same day; Naves next door offered in advance", () => {
    const contacts = [
      protege("a", "a", { at: TULLE(1), last: "2026-07-20", period: "QUARTER", minutes: 30 }),
      protege("b", "b", { at: TULLE(2), last: "2026-07-23", period: "QUARTER", minutes: 30 }),
      protege("n", "n", { at: NAVES, last: "2026-09-01", period: "QUARTER", minutes: 30 }),
    ];
    const plan = solve(createContext(state({ contacts })), MON, FRI);
    const days = plan.days.filter((d) => d.items.length > 0);
    expect(days).toHaveLength(1);
    const early = days[0]?.items.find((i) => i.task.person?.id === "n");
    expect(early?.task.early).toBe(true);
  });

  it("a town far from the day is not offered in advance", () => {
    const contacts = [
      protege("a", "a", { at: TULLE(1), last: "2026-07-20", period: "QUARTER", minutes: 30 }),
      protege("o", "o", { at: OBJAT(1), last: "2026-09-01", period: "QUARTER", minutes: 30 }),
    ];
    const plan = solve(createContext(state({ contacts })), MON, FRI);
    expect(plan.days.flatMap((d) => d.items).map((i) => i.task.person?.id)).toEqual(["a"]);
  });
});

describe("the minimum admin time is never eaten by proposed visits", () => {
  it("a day keeps its admin hours: the field time (road + visits) stays within the rest", () => {
    // 8:30–18:30 with 1 h lunch = 9 h; 6 h of admin leaves 3 h in the field.
    const contacts = Array.from({ length: 12 }, (_, i) => protege(`m${i}`, `m${i}`, { at: OBJAT(i), last: "2026-08-01", minutes: 60 }));
    const ctx = createContext(state({ contacts, settings: settings({ minAdmin: H(6) }) }));
    const plan = solve(ctx, MON, FRI);
    for (const day of plan.days) {
      if (day.items.length === 0) continue;
      const visits = day.items.reduce((s, i) => s + i.task.dur, 0);
      expect(visits).toBeLessThanOrEqual(H(3));
    }
    const without = solve(createContext(state({ contacts })), MON, FRI);
    const perDay = (p: typeof plan) => Math.max(...p.days.map((d) => d.items.length));
    expect(perDay(plan)).toBeLessThan(perDay(without));
  });
});

describe("« Durée pour cette fois »", () => {
  it("one occurrence gets its own length, the person's usual one stays for the others", () => {
    const person = protege("a", "a", { at: TULLE(1), last: "2026-09-19", minutes: 60 });
    const base = createContext(state({ contacts: [person] }));
    const [task] = buildTasks(base, MON, FRI, new Set()).tasks;
    if (!task) throw new Error("expected a visit");
    const once = createContext(state({ contacts: [person], durationOverrides: { [task.id]: 15 } }));
    expect(buildTasks(once, MON, FRI, new Set()).tasks[0]?.dur).toBe(15);
    expect(task.dur).toBe(60);
  });
});

describe("« Adresse temporaire »", () => {
  it("visits due while it lasts go there; the usual address comes back after", () => {
    const hospital = at("chu", 45.28, 1.77, "19000 Tulle");
    const person = { ...protege("a", "a", { at: OBJAT(1), last: "2026-09-19", minutes: 60 }), temporary: { place: hospital, from: "2026-10-01", to: "2026-10-31" } };
    const inside = buildTasks(createContext(state({ contacts: [person] })), MON, FRI, new Set()).tasks[0];
    expect(inside?.place.id).toBe("chu");
    const after = { ...person, temporary: { place: hospital, from: "2026-09-01", to: "2026-09-30" } };
    expect(buildTasks(createContext(state({ contacts: [after] })), MON, FRI, new Set()).tasks[0]?.place.address).toContain("Objat");
  });
});
