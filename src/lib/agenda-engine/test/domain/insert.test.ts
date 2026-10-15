import { describe, expect, it } from "vitest";
import {
  touchesValidatedPlan,
  applyInsertion,
  createContext,
  fixedConflicts,
  insertOptions,
  insertWithMoves,
  solve,
  toValidatedItems,
} from "../../domain";
import type { Appointment, PlannerState } from "../../domain";
import {
  FRI,
  H,
  MALEMORT,
  MON,
  TULLE,
  appt,
  protege,
  state,
  validatedItem,
} from "./fixtures";

const TUE = "2026-10-20";
const TODAY = "2026-10-14";
const A = validatedItem("A", MON, H(9), {
  movable: true,
  earliest: MON,
  latest: FRI,
});
const B = validatedItem("B", MON, H(10, 30));
const C = validatedItem("C", TUE, H(14), {
  place: TULLE,
  fixed: true,
  kind: "APPT",
  apptId: "C",
});

const base = (): PlannerState =>
  Object.freeze(
    state({ places: [TULLE], validated: Object.freeze([A, B, C]) }),
  );
const urgent: Appointment = appt(
  "urgent",
  { kind: "FIXED", date: MON, time: H(9) },
  { priority: "HIGH" },
);

function overlaps(s1: number, e1: number, s2: number, e2: number) {
  return s1 < e2 && s2 < e1;
}

describe("insertOptions: free slots, nothing moves", () => {
  it("offers up to four slots, cheapest detour first, around validated items", () => {
    const ctx = createContext(base());
    const options = insertOptions(
      ctx,
      appt("new", { kind: "RANGE", from: MON, to: "2026-10-21" }),
      TODAY,
    );
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(4);
    const kms = options.map((o) => o.addKm);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    for (const o of options) {
      for (const v of [A, B, C].filter((x) => x.date === o.date))
        expect(overlaps(o.start, o.end, v.start, v.end)).toBe(false);
    }
    expect(ctx.state.validated).toEqual([A, B, C]);
  });

  it("keeps a fixed-time appointment at its time", () => {
    const options = insertOptions(
      createContext(base()),
      appt("new", { kind: "FIXED", date: TUE, time: H(9) }),
      TODAY,
    );
    expect(options).toEqual([
      expect.objectContaining({ date: TUE, start: H(9), end: H(10) }),
    ]);
  });

  it("offers nothing when the fixed time is taken", () => {
    expect(insertOptions(createContext(base()), urgent, TODAY)).toEqual([]);
  });

  it("returns nothing for an unknown place", () => {
    expect(
      insertOptions(
        createContext(base()),
        appt(
          "x",
          { kind: "FIXED", date: TUE, time: H(9) },
          { placeId: "gone" },
        ),
        TODAY,
      ),
    ).toEqual([]);
  });

  it("respects the day's visit cap", () => {
    const full = state({
      places: [TULLE],
      validated: [A, B, C],
      rules: [
        {
          id: "cap",
          type: "MAX_VISITS",
          label: "Deux par jour",
          dow: 1,
          max: 2,
          strength: "HARD",
        },
      ],
    });
    const options = insertOptions(
      createContext(full),
      appt("new", { kind: "RANGE", from: MON, to: TUE }),
      TODAY,
    );
    expect(options.map((o) => o.date)).toEqual([TUE]);
  });

  it("never offers a slot before today", () => {
    const options = insertOptions(
      createContext(base()),
      appt("new", { kind: "RANGE", from: MON, to: "2026-10-21" }),
      TUE,
    );
    expect(options.every((o) => o.date >= TUE)).toBe(true);
    expect(
      insertOptions(
        createContext(base()),
        appt("old", { kind: "RANGE", from: MON, to: MON }),
        TUE,
      ),
    ).toEqual([]);
  });
});

describe("fixedConflicts", () => {
  it("lists validated items overlapping a fixed time", () => {
    const ctx = createContext(base());
    expect(
      fixedConflicts(
        ctx,
        appt("x", { kind: "FIXED", date: MON, time: H(9, 30) }, { dur: 30 }),
      ).map((v) => v.id),
    ).toEqual(["A"]);
    expect(
      fixedConflicts(ctx, appt("x", { kind: "WEEK", from: MON, to: FRI })),
    ).toEqual([]);
  });
});

describe("insertWithMoves: only what the user allowed moves", () => {
  it("cannot place the urgent appointment when nothing may move", () => {
    expect(insertWithMoves(createContext(base()), urgent, [], TODAY)).toEqual({
      placement: null,
      changes: [],
      bent: [],
    });
  });

  it("moves only the allowed item and lists the exact change", () => {
    const result = insertWithMoves(createContext(base()), urgent, ["A"], TODAY);
    expect(result.placement).toEqual({ date: MON, start: H(9), end: H(10) });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.item).toBe(A);
    const to = result.changes[0]?.to;
    expect(to).not.toBeNull();
    expect(
      to && overlaps(to.start, to.end, H(9), H(10)) && to.date === MON,
    ).toBe(false);
    expect(
      to && to.date === MON && overlaps(to.start, to.end, B.start, B.end),
    ).toBe(false);
  });

  it("never moves a past item, nor anything into the past", () => {
    const result = insertWithMoves(createContext(base()), urgent, ["A"], TUE);
    expect(result).toEqual({ placement: null, changes: [], bent: [] });
  });

  it("never moves a fixed item even if asked", () => {
    const result = insertWithMoves(
      createContext(base()),
      appt("u", { kind: "FIXED", date: TUE, time: H(14) }),
      ["C"],
      TODAY,
    );
    expect(result.placement).toBeNull();
    expect(result.changes).toEqual([]);
  });

  it("applies the insertion: the new item is added, moved items are flagged, nothing else changes", () => {
    const ctx = createContext(base());
    const next = applyInsertion(
      ctx,
      urgent,
      insertWithMoves(ctx, urgent, ["A"], TODAY),
    );
    expect(next).not.toBeNull();
    const byId = new Map((next ?? []).map((v) => [v.id, v]));
    expect(byId.get("B")).toBe(B);
    expect(byId.get("C")).toBe(C);
    expect(byId.get("A")).toMatchObject({
      moved: true,
      date: MON,
      start: H(11, 30),
      end: H(12, 30),
    });
    expect(byId.get("urgent")).toMatchObject({
      apptId: "urgent",
      kind: "APPT",
      fixed: true,
      date: MON,
      start: H(9),
      movable: false,
    });
    expect(next).toHaveLength(4);
  });

  it("refuses to apply an insertion that found no slot", () => {
    const ctx = createContext(base());
    expect(
      applyInsertion(ctx, urgent, { placement: null, changes: [], bent: [] }),
    ).toBeNull();
  });

  it("drops an allowed item that no longer fits anywhere, as listed in the changes", () => {
    const ctx = createContext(base());
    const result = {
      placement: { date: MON, start: H(9), end: H(10) },
      changes: [{ item: A, to: null }],
      bent: [],
    };
    expect(
      (applyInsertion(ctx, urgent, result) ?? []).map((v) => v.id),
    ).toEqual(["B", "C", "urgent"]);
  });
});

describe("toValidatedItems", () => {
  it("freezes a proposed plan into validated items, fixed appointments included", () => {
    const ctx = createContext(
      state({
        contacts: [
          protege("jean", "Jean Bonneau", { at: MALEMORT, last: "2026-09-22" }),
        ],
        appointments: [
          appt(
            "f",
            { kind: "FIXED", date: MON, time: H(15) },
            { priority: "HIGH" },
          ),
        ],
      }),
    );
    const items = toValidatedItems(solve(ctx, MON, FRI));
    expect(
      items.map((v) => [v.id, v.kind, v.fixed, v.movable, v.moved]),
    ).toEqual([
      ["f", "APPT", true, false, false],
      ["jean@2026-10-22", "VISIT", false, false, false],
    ]);
    expect(items[1]).toMatchObject({
      personId: "jean",
      participants: ["jean"],
      earliest: MON,
      latest: "2026-10-28",
    });
    expect(items[0]).toMatchObject({
      apptId: "f",
      date: MON,
      start: H(15),
      end: H(16),
      priority: "HIGH",
    });
  });
});

describe("touchesValidatedPlan: urgent insertion only applies to a validated period", () => {
  it("is false before the week is validated: the appointment is simply planned by priority", () => {
    const st = state({ validated: [] });
    expect(
      touchesValidatedPlan(
        st,
        appt("x", { kind: "RANGE", from: MON, to: FRI }),
      ),
    ).toBe(false);
  });

  it("is true when the appointment's dates touch validated items", () => {
    const st = base();
    expect(
      touchesValidatedPlan(
        st,
        appt("x", { kind: "RANGE", from: TUE, to: FRI }),
      ),
    ).toBe(true);
    expect(
      touchesValidatedPlan(
        st,
        appt("x", { kind: "FIXED", date: MON, time: H(17) }),
      ),
    ).toBe(true);
    expect(
      touchesValidatedPlan(
        st,
        appt("x", { kind: "RANGE", from: "2026-10-26", to: "2026-10-30" }),
      ),
    ).toBe(false);
  });
});
