import { describe, expect, it } from "vitest";
import {
  createContext,
  lastSeen,
  pinTask,
  solve,
  unpin,
  validatePlan,
} from "../../domain";
import type { Plan, PlannerState } from "../../domain";
import {
  FRI,
  H,
  MALEMORT,
  MON,
  TULLE,
  USSEL,
  appt,
  protege,
  settings,
  state,
} from "./fixtures";

const placed = (plan: Plan) =>
  plan.days.flatMap((d) =>
    d.items.map((i) => ({
      id: i.task.id,
      date: d.date,
      start: i.start,
      end: i.end,
    })),
  );
const pinnedBlocks = (plan: Plan) =>
  plan.days.flatMap((d) =>
    d.blocks
      .filter((b) => b.task?.pinned === true)
      .map((b) => ({ id: b.task?.id, date: d.date, s: b.s })),
  );

describe("day end: a wished end and a strict limit, drive home included", () => {
  // One working day, a 2 h visit far away (Ussel, ~2 h drive each way).
  const far = protege("far", "Paul Ochon", {
    at: USSEL,
    last: "2026-09-22",
    priority: "HIGH",
    minutes: 120,
  });
  const day = (o: {
    dayEnd: number;
    dayEndLimit: number | null;
    dayStart?: number;
  }) =>
    state({
      settings: settings({
        workDays: [1],
        lunch: null,
        dayStart: o.dayStart ?? H(12),
        dayEnd: o.dayEnd,
        dayEndLimit: o.dayEndLimit,
      }),
      contacts: [far],
    });

  it("never makes you come home after the strict limit", () => {
    const plan = solve(
      createContext(day({ dayEnd: H(17), dayEndLimit: H(17) })),
      MON,
      FRI,
    );
    expect(placed(plan)).toEqual([]);
    expect(plan.unplaced.map((u) => u.task?.id)).toEqual(["far@2026-10-22"]);
  });

  it("may go past the wished end, up to the strict limit", () => {
    const plan = solve(
      createContext(day({ dayEnd: H(17), dayEndLimit: H(19) })),
      MON,
      FRI,
    );
    expect(placed(plan)).toHaveLength(1);
    expect(plan.days[0]?.finish).toBeGreaterThan(H(17));
    expect(plan.days[0]?.finish).toBeLessThanOrEqual(H(19));
  });

  it("treats a missing strict limit as the wished end", () => {
    const plan = solve(
      createContext(day({ dayEnd: H(17), dayEndLimit: null })),
      MON,
      FRI,
    );
    expect(placed(plan)).toEqual([]);
  });

  it("prefers a day without overtime when both are possible", () => {
    // Due on Monday, but on Monday it only fits after a long office meeting, ending past the wished 17:00.
    const near = protege("near", "Jean Bonneau", {
      at: MALEMORT,
      last: "2026-09-19",
      priority: "HIGH",
      notBefore: H(16),
    });
    const st = state({
      settings: settings({
        workDays: [1, 2],
        lunch: null,
        dayEnd: H(17),
        dayEndLimit: H(19),
      }),
      contacts: [near],
      appointments: [
        appt(
          "meeting",
          { kind: "FIXED", date: MON, time: H(13, 30) },
          { placeId: "office", dur: 195 },
        ),
      ],
    });
    const plan = solve(createContext(st), MON, FRI);
    expect(placed(plan)).toEqual([
      expect.objectContaining({ id: "near@2026-10-19", date: "2026-10-20" }),
    ]);
  });

  it("lets an appointment you placed yourself end after the limit, and still plans that day", () => {
    const near = protege("near", "Jean Bonneau", {
      at: MALEMORT,
      last: "2026-09-22",
      priority: "HIGH",
    });
    const st = state({
      settings: settings({ workDays: [1], dayEnd: H(17), dayEndLimit: H(18) }),
      contacts: [near],
      appointments: [
        appt(
          "evening",
          { kind: "FIXED", date: MON, time: H(19) },
          { placeId: "office" },
        ),
      ],
    });
    const plan = solve(createContext(st), MON, FRI);
    expect(placed(plan)).toHaveLength(1);
    expect(plan.days[0]?.unreachable).toBe(false);
  });
});

describe("dragging a proposed block before validation", () => {
  const jean = protege("jean", "Jean Bonneau", {
    at: MALEMORT,
    last: "2026-09-22",
    priority: "NORMAL",
  });
  const base = (): PlannerState => state({ contacts: [jean], places: [TULLE] });

  function pinned(st: PlannerState, date: string, start: number): PlannerState {
    const plan = solve(createContext(st), MON, FRI);
    const task = plan.days
      .flatMap((d) => d.items)
      .find((i) => i.task.id === "jean@2026-10-22")?.task;
    if (!task) throw new Error("visit not proposed");
    return pinTask(st, task, { date, start });
  }

  it("keeps the block where you put it and plans the rest around it", () => {
    const st = pinned(base(), "2026-10-20", H(15));
    const plan = solve(createContext(st), MON, FRI);
    expect(pinnedBlocks(plan)).toEqual([
      { id: "jean@2026-10-22", date: "2026-10-20", s: H(15) },
    ]);
    expect(placed(plan).map((p) => p.id)).not.toContain("jean@2026-10-22");
    expect(plan.pinWarnings).toEqual([]);
  });

  it("is not the planning yet: it is never « vu », but it is not proposed twice", () => {
    const st = pinned(base(), "2026-10-27", H(10));
    expect(
      lastSeen(createContext({ ...st, today: "2026-11-30" }), jean).date,
    ).toBe("2026-09-22");
    const plan = solve(createContext(st), MON, "2026-11-06");
    const ids = [
      ...placed(plan).map((p) => p.id),
      ...pinnedBlocks(plan).map((p) => p.id),
    ];
    expect(ids.filter((id) => id?.startsWith("jean@"))).toEqual([
      "jean@2026-10-22",
    ]);
  });

  it("shows up in any week you look at", () => {
    const st = pinned(base(), "2026-10-28", H(10));
    expect(
      pinnedBlocks(solve(createContext(st), "2026-10-26", "2026-10-30")),
    ).toHaveLength(1);
    expect(pinnedBlocks(solve(createContext(st), MON, FRI))).toEqual([]);
  });

  it("warns, without refusing, when your position breaks something", () => {
    const st0 = state({
      contacts: [jean],
      settings: settings({ dayEnd: H(17), dayEndLimit: H(18) }),
      appointments: [
        appt("f", { kind: "FIXED", date: "2026-10-21", time: H(10) }),
      ],
      rules: [
        {
          id: "tue-off",
          type: "UNAVAILABLE",
          label: "Mardi off",
          dow: 2,
          allDay: true,
          strength: "HARD",
        },
      ],
    });
    const warn = (date: string, start: number) =>
      solve(
        createContext(pinned(st0, date, start)),
        MON,
        "2026-10-25",
      ).pinWarnings.map((w) => w.reason);
    expect(warn("2026-10-20", H(10))).toEqual(["CLOSED_DAY"]);
    expect(warn("2026-10-21", H(10, 30))).toEqual(["OVERLAP"]);
    expect(warn("2026-10-22", H(12))).toEqual(["LUNCH"]);
    expect(warn("2026-10-22", H(17, 30))).toEqual(["PAST_LIMIT"]);
    expect(warn("2026-10-24", H(10))).toEqual(["CLOSED_DAY"]);
  });

  it("warns when a participant is not available then", () => {
    const son = {
      ...protege("son", "Marc Bonneau", { at: MALEMORT, last: "2026-09-22" }),
      category: "FAMILLE" as const,
      visits: null,
      avail: [{ dows: [1, 2, 3, 4, 5] as const, from: H(17), to: H(19) }],
    };
    const meet = appt(
      "meet",
      { kind: "RANGE", from: MON, to: FRI },
      { participants: ["jean", "son"], placeId: "jean-home" },
    );
    const st = state({ contacts: [jean, son], appointments: [meet] });
    const plan = solve(createContext(st), MON, FRI);
    const task = plan.days
      .flatMap((d) => d.items)
      .find((i) => i.task.id === "meet")?.task;
    if (!task) throw new Error("meeting not proposed");
    const moved = pinTask(st, task, { date: "2026-10-21", start: H(10) });
    expect(solve(createContext(moved), MON, FRI).pinWarnings).toEqual([
      {
        taskId: "meet",
        title: meet.title,
        date: "2026-10-21",
        reason: "UNAVAILABLE",
      },
    ]);
  });

  it("can be put back in the planner's hands", () => {
    const st = unpin(pinned(base(), "2026-10-20", H(15)), "jean@2026-10-22");
    expect(st.pins).toEqual([]);
    expect(
      placed(solve(createContext(st), MON, FRI)).map((p) => p.id),
    ).toContain("jean@2026-10-22");
  });

  it("moving it again replaces the previous position", () => {
    const once = pinned(base(), "2026-10-20", H(15));
    const pin = once.pins[0];
    if (!pin) throw new Error("no pin");
    const twice = pinTask(once, pin, { date: "2026-10-21", start: H(9) });
    expect(twice.pins.map((p) => [p.id, p.date, p.start])).toEqual([
      ["jean@2026-10-22", "2026-10-21", H(9)],
    ]);
  });

  it("becomes a normal validated item when the week is validated", () => {
    const st = pinned(base(), "2026-10-20", H(15));
    const next = validatePlan(st, solve(createContext(st), MON, FRI));
    expect(next.pins).toEqual([]);
    expect(next.validated.map((v) => [v.id, v.date, v.start])).toEqual([
      ["jean@2026-10-22", "2026-10-20", H(15)],
    ]);
  });
});
