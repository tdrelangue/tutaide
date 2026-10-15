import { describe, expect, it } from "vitest";
import { createContext, propose, solve } from "../../domain";
import type { IsoDow, Plan, PlannerState, SlotRule } from "../../domain";
import {
  FRI,
  H,
  MALEMORT,
  MON,
  OBJAT,
  TULLE,
  appt,
  protege,
  settings,
  state,
  validatedItem,
} from "./fixtures";

const ONLY_MONDAY = settings({ workDays: [1] });
const allDay = (
  id: string,
  dow: IsoDow,
  strength: SlotRule["strength"],
): SlotRule => ({
  id,
  type: "UNAVAILABLE",
  label: id,
  dow,
  allDay: true,
  strength,
});
const cap = (
  id: string,
  dow: IsoDow,
  max: number,
  strength: SlotRule["strength"] = "HARD",
): SlotRule => ({
  id,
  type: "MAX_VISITS",
  label: id,
  dow,
  max,
  strength,
});

/** A monthly visit due on Thursday 22 October (window Monday 19 → Wednesday 28). */
const jean = (priority: "LOW" | "NORMAL" | "HIGH" | "MUST" = "LOW") =>
  protege("jean", "Jean Bonneau", {
    at: MALEMORT,
    last: "2026-09-22",
    priority,
  });

const placedIds = (plan: Plan, date?: string) =>
  plan.days
    .filter((d) => !date || d.date === date)
    .flatMap((d) => d.items.map((i) => i.task.id));

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
const run = (s: PlannerState, from = MON, to = FRI) =>
  solve(createContext(deepFreeze(s)), from, to);

describe("rules", () => {
  it("never breaks an imperative rule", () => {
    const plan = run(
      state({
        contacts: [jean("HIGH")],
        rules: [allDay("mon", 1, "HARD"), allDay("tue", 2, "HARD")],
      }),
    );
    expect(placedIds(plan, MON)).toEqual([]);
    expect(placedIds(plan, "2026-10-20")).toEqual([]);
    expect(placedIds(plan)).toEqual(["jean@2026-10-22"]);
  });

  describe("« Important » is only broken after the user answers « exception »", () => {
    const s = state({
      settings: settings({ workDays: [1, 2] }),
      rules: [allDay("monday-home", 1, "STRONG"), cap("tue", 2, 1)],
      appointments: [
        appt("a1", { kind: "WEEK", from: MON, to: FRI }, { priority: "HIGH" }),
        appt("a2", { kind: "WEEK", from: MON, to: FRI }),
      ],
    });

    it("respects the rule and asks, with both options costed", () => {
      const { plan, questions } = propose(createContext(s), MON, FRI);
      expect(placedIds(plan, MON)).toEqual([]);
      expect(plan.unplaced.map((u) => u.apptId)).toEqual(["a2"]);
      expect(questions).toHaveLength(1);
      expect(questions[0]?.rule.id).toBe("monday-home");
      expect(questions[0]?.gainTrouble).toBeGreaterThan(0);
      expect(questions[0]?.exception.unplaced).toEqual([]);
      expect(questions[0]?.respect).toBe(plan);
    });

    it("breaks it once the user chose the exception", () => {
      const { plan } = propose(
        createContext({ ...s, answers: { "monday-home": "break" } }),
        MON,
        FRI,
      );
      expect(plan.unplaced).toEqual([]);
      expect(placedIds(plan, MON).length).toBeGreaterThanOrEqual(1);
    });

    it("keeps it when the user chose to respect it", () => {
      const { plan } = propose(
        createContext({ ...s, answers: { "monday-home": "respect" } }),
        MON,
        FRI,
      );
      expect(placedIds(plan, MON)).toEqual([]);
    });

    it("does not ask when breaking the rule gains nothing", () => {
      const { questions } = propose(
        createContext({ ...s, appointments: [] }),
        MON,
        FRI,
      );
      expect(questions).toEqual([]);
    });
  });

  describe("« Souhaité » is never broken for a low-priority visit", () => {
    const s = (priority: "LOW" | "NORMAL", refused: string[] = []) =>
      state({
        settings: ONLY_MONDAY,
        contacts: [jean(priority)],
        rules: [allDay("monday-off", 1, "MEDIUM")],
        refusedExceptions: refused,
      });

    it("postpones the low visit quietly", () => {
      const plan = run(s("LOW"));
      expect(placedIds(plan)).toEqual([]);
      expect(plan.postponed.map((t) => t.id)).toEqual(["jean@2026-10-22"]);
      expect(plan.unplaced).toEqual([]);
      expect(plan.bent).toEqual([]);
    });

    it("bends it for a normal visit and says so", () => {
      const plan = run(s("NORMAL"));
      expect(placedIds(plan, MON)).toEqual(["jean@2026-10-22"]);
      expect(plan.bent.map((b) => b.rule.id)).toEqual(["monday-off"]);
    });

    it("never bends it again once the exception is refused", () => {
      const plan = run(s("NORMAL", ["monday-off"]));
      expect(placedIds(plan)).toEqual([]);
      expect(plan.unplaced[0]).toMatchObject({
        reason: "NO_FREE_DAY",
        priority: "NORMAL",
      });
    });

    it("applies to a preferred day too", () => {
      const pref = {
        id: "wed",
        type: "PREF_DAY" as const,
        dow: 3 as const,
        strength: "MEDIUM" as const,
        label: "Le mercredi",
      };
      const rules = [allDay("wed-off", 3, "HARD")];
      const low = run(
        state({
          contacts: [
            protege("aude", "Aude Javel", {
              at: OBJAT,
              last: "2026-09-22",
              prefDay: pref,
            }),
          ],
          rules,
        }),
      );
      expect(placedIds(low)).toEqual([]);
      const normal = run(
        state({
          contacts: [
            protege("aude", "Aude Javel", {
              at: OBJAT,
              last: "2026-09-22",
              prefDay: pref,
              priority: "NORMAL",
            }),
          ],
          rules,
        }),
      );
      expect(placedIds(normal)).toHaveLength(1);
      expect(normal.bent.map((b) => b.rule.id)).toEqual(["wed"]);
    });

    it("bends a « Souhaité » visit cap only for non-low items", () => {
      const rules = [cap("light", 1, 0, "MEDIUM")];
      expect(
        placedIds(
          run(state({ settings: ONLY_MONDAY, contacts: [jean("LOW")], rules })),
        ),
      ).toEqual([]);
      const normal = run(
        state({ settings: ONLY_MONDAY, contacts: [jean("NORMAL")], rules }),
      );
      expect(placedIds(normal)).toHaveLength(1);
      expect(normal.bent.map((b) => b.rule.id)).toEqual(["light"]);
    });
  });

  it("treats « Si possible » as a cost only", () => {
    const plan = run(
      state({
        settings: ONLY_MONDAY,
        contacts: [jean("LOW")],
        rules: [allDay("soft", 1, "SOFT"), cap("c", 1, 0, "SOFT")],
      }),
    );
    expect(placedIds(plan, MON)).toEqual(["jean@2026-10-22"]);
    expect(plan.bent).toEqual([]);
  });

  it("prefers the preferred day when it is free and reports soft misses", () => {
    const pref = {
      id: "wed",
      type: "PREF_DAY" as const,
      dow: 3 as const,
      strength: "SOFT" as const,
      label: "Le mercredi",
    };
    const aude = protege("aude", "Aude Javel", {
      at: OBJAT,
      last: "2026-09-22",
      prefDay: pref,
    });
    expect(
      placedIds(run(state({ contacts: [aude] })), "2026-10-21"),
    ).toHaveLength(1);
    const missed = run(
      state({ contacts: [aude], rules: [allDay("w", 3, "HARD")] }),
    );
    expect(missed.softMissed.map((m) => m.rule.id)).toEqual(["wed"]);
  });
});

describe("priorities", () => {
  const oneSlot = (
    contacts = [jean("LOW")],
    appointments = [
      appt(
        "urgent",
        { kind: "WEEK", from: MON, to: FRI },
        { priority: "HIGH" },
      ),
    ],
  ) =>
    run(
      state({
        settings: ONLY_MONDAY,
        rules: [cap("one", 1, 1)],
        contacts,
        appointments,
      }),
    );

  it("places higher priorities first", () => {
    const plan = oneSlot();
    expect(placedIds(plan)).toEqual(["urgent"]);
  });

  it("postpones a low visit without a question", () => {
    const s = state({
      settings: ONLY_MONDAY,
      rules: [cap("one", 1, 1)],
      contacts: [jean("LOW")],
      appointments: [
        appt(
          "urgent",
          { kind: "WEEK", from: MON, to: FRI },
          { priority: "HIGH" },
        ),
      ],
    });
    const { plan, questions } = propose(createContext(s), MON, FRI);
    expect(plan.postponed.map((t) => t.id)).toEqual(["jean@2026-10-22"]);
    expect(plan.unplaced).toEqual([]);
    expect(plan.alerts).toEqual([]);
    expect(questions).toEqual([]);
  });

  it("raises an alert when an « Incontournable » item cannot be placed", () => {
    const musts = [
      appt("m1", { kind: "WEEK", from: MON, to: FRI }, { priority: "MUST" }),
      appt("m2", { kind: "WEEK", from: MON, to: FRI }, { priority: "MUST" }),
    ];
    const plan = oneSlot([], musts);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0]).toMatchObject({
      priority: "MUST",
      reason: "NO_COMMON_SLOT",
    });
  });

  it("reports a low-priority appointment that finds no slot, instead of postponing it quietly", () => {
    const low = appt(
      "low",
      { kind: "WEEK", from: MON, to: FRI },
      { priority: "LOW" },
    );
    const plan = oneSlot(
      [],
      [
        appt(
          "urgent",
          { kind: "WEEK", from: MON, to: FRI },
          { priority: "HIGH" },
        ),
        low,
      ],
    );
    expect(plan.postponed).toEqual([]);
    expect(plan.unplaced.map((u) => [u.apptId, u.reason])).toEqual([
      ["low", "NO_COMMON_SLOT"],
    ]);
  });

  it("places a non-strict visit late rather than dropping it, and says by how much", () => {
    const tight = protege("t", "Thérèse Ponsable", {
      at: TULLE,
      last: "2026-09-01",
      priority: "NORMAL",
    });
    const closed = ([1, 2, 3, 4] as const).map((d) =>
      allDay(`d${d}`, d, "HARD"),
    );
    const plan = run(
      state({ contacts: [tight], rules: closed }),
      MON,
      "2026-10-30",
    );
    expect(plan.late).toHaveLength(1);
    expect(plan.late[0]).toMatchObject({ date: "2026-10-23", days: 1 });
    expect(plan.unplaced).toEqual([]);
  });
});

describe("closures and tours", () => {
  it("closes vacation days", () => {
    const plan = run(
      state({
        contacts: [jean("HIGH")],
        rules: [
          {
            id: "v",
            type: "VACATION",
            label: "Toussaint",
            from: MON,
            to: FRI,
            strength: "HARD",
          },
        ],
      }),
    );
    expect(placedIds(plan)).toEqual([]);
    expect(plan.days.every((d) => d.closed?.id === "v")).toBe(true);
  });

  it("groups nearby visits on the same day", () => {
    const near = [
      protege("a", "Alain Térieur", { at: TULLE, last: "2026-09-22" }),
      protege("b", "Alex Térieur", {
        at: { ...TULLE, lat: TULLE.lat + 0.002 },
        last: "2026-09-22",
      }),
    ];
    const plan = run(state({ contacts: near }));
    const days = plan.days.filter((d) => d.items.length > 0);
    expect(days).toHaveLength(1);
  });

  it("flags a day whose fixed appointments cannot all be reached", () => {
    const plan = run(
      state({
        places: [TULLE],
        appointments: [
          appt(
            "f1",
            { kind: "FIXED", date: MON, time: H(10) },
            { placeId: "office" },
          ),
          appt(
            "f2",
            { kind: "FIXED", date: MON, time: H(11) },
            { placeId: "tulle" },
          ),
        ],
      }),
    );
    expect(plan.days[0]?.unreachable).toBe(true);
    expect(plan.days[1]?.unreachable).toBe(false);
  });

  it("reports an appointment whose place no longer exists", () => {
    const plan = run(
      state({
        appointments: [
          appt(
            "lost",
            { kind: "WEEK", from: MON, to: FRI },
            { placeId: "gone", priority: "MUST" },
          ),
        ],
      }),
    );
    expect(plan.unplaced).toEqual([
      {
        task: null,
        apptId: "lost",
        personId: null,
        priority: "MUST",
        reason: "UNKNOWN_PLACE",
      },
    ]);
    expect(plan.alerts).toHaveLength(1);
  });
});

describe("a validated plan never moves", () => {
  const held = [
    validatedItem("v1", MON, H(9), {
      participants: ["jean"],
      personId: "jean",
    }),
    validatedItem("v2", "2026-10-21", H(14), { place: TULLE }),
  ];

  it("keeps validated items exactly where they are and plans around them", () => {
    const s = state({
      contacts: [
        protege("x", "Sacha Touille", {
          at: MALEMORT,
          last: "2026-09-22",
          priority: "HIGH",
        }),
      ],
      validated: held,
    });
    const plan = run(s);
    const blocks = plan.days.flatMap((d) =>
      d.blocks
        .filter((b) => b.kind === "held")
        .map((b) => [d.date, b.s, b.e, b.label]),
    );
    expect(blocks).toEqual([
      [MON, H(9), H(10), "Visite v1"],
      ["2026-10-21", H(14), H(15), "Visite v2"],
    ]);
    expect(placedIds(plan)).not.toContain("v1");
    expect(placedIds(plan)).not.toContain("v2");
  });

  it("is deterministic", () => {
    const s = state({
      contacts: [
        jean(),
        protege("x", "Sacha Touille", { at: TULLE, last: "2026-09-25" }),
      ],
      validated: held,
    });
    expect(run(s)).toEqual(run(s));
  });
});
