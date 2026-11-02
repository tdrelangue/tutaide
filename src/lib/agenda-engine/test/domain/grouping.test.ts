import { describe, expect, it } from "vitest";
import { buildTasks, cityKey, createContext, groupingCost, intervalDays, solve } from "../../domain";
import type { Contact, Place, Task } from "../../domain";
import { FRI, MON, place, protege, state } from "./fixtures";

const inCity = (id: string, lat: number, lon: number, city: string, site?: string): Place => ({
  ...place(id, lat, lon),
  address: `1 rue ${id} ${city}`,
  ...(site ? { site } : {}),
});

const TULLE_A = inCity("tulle-a", 45.2675, 1.7716, "19000 Tulle");
const TULLE_B = inCity("tulle-b", 45.27, 1.775, "19000 Tulle");
const OBJAT_A = inCity("objat-a", 45.2626, 1.4083, "19130 Objat");
const CORNIL_EHPAD = inCity("cornil", 45.2078, 1.6913, "19150 Cornil", "190002113");

/** The first task of each person, in the order of the persons. */
function tasksOf(contacts: readonly Contact[]): Task[] {
  const ctx = createContext(state({ contacts }));
  const tasks = buildTasks(ctx, MON, FRI, new Set()).tasks;
  return contacts.map((c) => {
    const task = tasks.find((t) => t.person?.id === c.id);
    if (!task) throw new Error(`no task for ${c.id}`);
    return task;
  });
}

function three(tasks: readonly Task[]): [Task, Task, Task] {
  const [a, b, c] = tasks;
  if (!a || !b || !c) throw new Error("expected three tasks");
  return [a, b, c];
}

describe("visits are grouped by city, then by establishment (Thomas, 2026-11-02)", () => {
  it("reads the city from the postcode of the address", () => {
    expect(cityKey("32 Grand'Rue 19150 Cornil")).toBe("19150 cornil");
    expect(cityKey("EHPAD, 2 av. du Dr Roullet, 19200 USSEL")).toBe("19200 ussel");
    expect(cityKey("19100 Brive-la-Gaillarde")).toBe("19100 brive");
    expect(cityKey("Lieu sans code postal")).toBeNull();
  });

  it("draws a visit to the day of its town, and costs extra only for a far town", () => {
    const [tulle, objat, tulleToo] = three(tasksOf([
      protege("a", "Jean Bonneau", { at: TULLE_A, last: "2026-09-19" }),
      protege("b", "Sarah Croche", { at: OBJAT_A, last: "2026-09-19" }),
      protege("c", "Paul Ochon", { at: TULLE_B, last: "2026-09-19" }),
    ]));
    expect(groupingCost(tulle, [])).toBe(0);
    expect(groupingCost(tulleToo, [tulle])).toBeLessThan(0);
    expect(groupingCost(objat, [tulle])).toBeGreaterThan(0);
    const nextDoor = { ...objat, place: { ...objat.place, address: "1 rue x 19000 Laguenne", lat: 45.25, lon: 1.78 } };
    expect(groupingCost(nextDoor, [tulle])).toBe(0);
  });

  it("favours the day that already visits the same EHPAD", () => {
    const [first, second] = three(tasksOf([
      protege("a", "Jean Bonneau", { at: { ...CORNIL_EHPAD, id: "x" }, last: "2026-09-19" }),
      protege("b", "Sarah Croche", { at: { ...CORNIL_EHPAD, id: "y" }, last: "2026-09-19" }),
      protege("c", "Paul Ochon", { at: TULLE_B, last: "2026-09-19" }),
    ]));
    const sameTownOnly = groupingCost(second, [{ ...first, place: { ...first.place, site: "other" } }]);
    expect(groupingCost(second, [first])).toBeLessThan(sameTownOnly);
  });

  it("plans a week with each day kept to one town when the windows allow it", () => {
    const persons = ["a", "b", "c", "d"].flatMap((k, i) => [
      protege(`t${k}`, `Tulle ${k}`, { at: { ...TULLE_A, id: `t${k}`, lat: 45.2675 + i * 0.002 }, last: "2026-09-19", minutes: 120 }),
      protege(`o${k}`, `Objat ${k}`, { at: { ...OBJAT_A, id: `o${k}`, lat: 45.2626 + i * 0.002 }, last: "2026-09-19", minutes: 120 }),
    ]);
    const plan = solve(createContext(state({ contacts: persons })), MON, FRI);
    const towns = plan.days
      .map((d) => new Set(d.items.map((it) => cityKey(it.task.place.address))))
      .filter((s) => s.size > 0);
    expect(towns.every((s) => s.size === 1)).toBe(true);
  });
});

describe("frequency « tous les N »", () => {
  it("every second week is a 14-day interval; every 2 months about 61 days", () => {
    const base = { count: 1, lastVisit: MON, priority: "LOW", minutes: null } as const;
    expect(intervalDays({ ...base, period: "WEEK", every: 2 })).toBe(14);
    expect(intervalDays({ ...base, period: "MONTH", every: 2 })).toBeCloseTo(60.8);
    expect(intervalDays({ ...base, period: "QUARTER" })).toBeCloseTo(91.3);
  });
});
