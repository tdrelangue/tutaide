import { describe, expect, it } from "vitest";
import {
  apptTask,
  buildDays,
  createContext,
  simulate,
  straightLineTravel,
  VISIO,
} from "../../domain";
import type {
  Day,
  IsoDow,
  PlannerContext,
  RuleOptions,
  SlotRule,
  Task,
} from "../../domain";
import {
  H,
  HOME,
  MALEMORT,
  MON,
  OFFICE,
  TULLE,
  appt,
  place,
  state,
  validatedItem,
} from "./fixtures";

const NONE: RuleOptions = { relaxed: new Set(), refused: new Set() };

function oneDay(
  ctx: PlannerContext,
  date = MON,
  opts = NONE,
  fixed: Task[] = [],
): Day {
  const days = buildDays(ctx, date, date, fixed, ctx.state.validated, opts);
  const day = days[0];
  if (!day) throw new Error(`no working day on ${date}`);
  return day;
}

function task(
  ctx: PlannerContext,
  id: string,
  placeId: string,
  dur = 60,
): Task {
  const t = apptTask(
    ctx,
    appt(id, { kind: "WEEK", from: MON, to: "2026-10-23" }, { placeId, dur }),
  );
  if (!t) throw new Error("bad place");
  return t;
}

const unavailable = (
  id: string,
  strength: SlotRule["strength"] = "HARD",
  dow: IsoDow = 1,
): SlotRule => ({
  type: "UNAVAILABLE",
  id,
  label: id,
  dow,
  allDay: true,
  strength,
});
const office: SlotRule = {
  type: "UNAVAILABLE",
  id: "bureau",
  label: "Bureau",
  dow: 1,
  allDay: false,
  from: H(9),
  to: H(12),
  atOffice: true,
  strength: "HARD",
};

describe("buildDays", () => {
  it("keeps working days only and adds the lunch break", () => {
    const ctx = createContext(state());
    const days = buildDays(ctx, MON, "2026-10-25", [], [], NONE);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(days[0]?.blocks).toEqual([
      {
        s: H(12, 30),
        e: H(13, 30),
        label: "Pause déjeuner",
        kind: "lunch",
        place: null,
        ruleId: null,
        task: null,
      },
    ]);
  });

  it("keeps a weekend day that holds a fixed appointment, without planning on it", () => {
    const ctx = createContext(state());
    const sat = apptTask(
      ctx,
      appt("sat", { kind: "FIXED", date: "2026-10-24", time: H(10) }),
    );
    const days = buildDays(ctx, MON, "2026-10-25", sat ? [sat] : [], [], NONE);
    expect(days.map((d) => [d.date, d.offDay])).toContainEqual([
      "2026-10-24",
      true,
    ]);
    expect(days.find((d) => d.date === "2026-10-25")).toBeUndefined();
    expect(days.find((d) => d.date === MON)?.offDay).toBe(false);
  });

  it("closes vacation days whatever their strength", () => {
    const ctx = createContext(
      state({
        rules: [
          {
            id: "vac",
            type: "VACATION",
            label: "Toussaint",
            from: MON,
            to: MON,
            strength: "SOFT",
          },
        ],
      }),
    );
    expect(oneDay(ctx).closed?.id).toBe("vac");
  });

  it("applies the four strengths of an all-day unavailability", () => {
    const at = (strength: SlotRule["strength"], opts = NONE) =>
      oneDay(
        createContext(state({ rules: [unavailable("r", strength)] })),
        MON,
        opts,
      );
    expect(at("HARD").closed?.id).toBe("r");
    expect(at("STRONG").closed?.id).toBe("r");
    expect(
      at("STRONG", { relaxed: new Set(["r"]), refused: new Set() }).closed,
    ).toBeNull();
    expect(at("MEDIUM").closed).toBeNull();
    expect(at("MEDIUM").softClosed?.id).toBe("r");
    expect(
      at("MEDIUM", { relaxed: new Set(), refused: new Set(["r"]) }).closed?.id,
    ).toBe("r");
    expect(at("SOFT").closed).toBeNull();
    expect(at("SOFT").penalty).toBeGreaterThan(0);
  });

  it("turns an office slot into a block at the office", () => {
    const rule = office;
    const day = oneDay(createContext(state({ rules: [rule] })));
    expect(day.blocks[0]).toMatchObject({
      s: H(9),
      e: H(12),
      kind: "busy",
      place: OFFICE,
      ruleId: "bureau",
    });
  });

  it("maps visit caps to imperative, bendable and cost-only limits", () => {
    const cap = (strength: SlotRule["strength"]) =>
      oneDay(
        createContext(
          state({
            rules: [
              {
                id: "c",
                type: "MAX_VISITS",
                label: "Léger",
                dow: 1,
                max: 2,
                strength,
              },
            ],
          }),
        ),
      );
    expect(cap("HARD").cap).toBe(2);
    expect(cap("STRONG").cap).toBe(2);
    expect(cap("MEDIUM").capSoft?.max).toBe(2);
    expect(cap("SOFT").capCost?.max).toBe(2);
  });

  it("ignores rules for other days and puts fixed and validated items in time order", () => {
    const ctx = createContext(
      state({
        rules: [unavailable("tue", "HARD", 2)],
        validated: [validatedItem("held", MON, H(15))],
      }),
    );
    const fixed = apptTask(
      ctx,
      appt("f", { kind: "FIXED", date: MON, time: H(9) }),
    );
    const day = oneDay(ctx, MON, NONE, fixed ? [fixed] : []);
    expect(day.closed).toBeNull();
    expect(day.blocks.map((b) => b.kind)).toEqual(["event", "lunch", "held"]);
  });
});

describe("simulate", () => {
  it("returns an empty tour for an empty day", () => {
    const ctx = createContext(state());
    expect(simulate(ctx, oneDay(ctx), [])).toEqual({
      items: [],
      km: 0,
      finish: H(8, 30),
    });
  });

  it("drives home → visit → home and starts on arrival", () => {
    const ctx = createContext(state({ places: [MALEMORT] }));
    const sim = simulate(ctx, oneDay(ctx), [task(ctx, "v", "malemort")]);
    const drive = straightLineTravel.minutes(HOME, MALEMORT);
    expect(sim?.items[0]).toMatchObject({
      start: H(8, 30) + drive,
      end: H(8, 30) + drive + 60,
    });
    expect(sim?.km).toBeCloseTo(2 * straightLineTravel.km(HOME, MALEMORT), 6);
  });

  it("counts no travel for a video call", () => {
    const ctx = createContext(state());
    const sim = simulate(ctx, oneDay(ctx), [task(ctx, "v", "visio")]);
    expect(sim).toEqual({
      items: [expect.objectContaining({ start: H(8, 30) })],
      km: 0,
      finish: H(9, 30),
    });
    expect(VISIO.remote).toBe(true);
  });

  it("counts the trip to the office in the tour", () => {
    const rule = office;
    const ctx = createContext(state({ rules: [rule], places: [TULLE] }));
    const sim = simulate(ctx, oneDay(ctx), [task(ctx, "v", "tulle")]);
    const expected =
      straightLineTravel.km(HOME, OFFICE) +
      straightLineTravel.km(OFFICE, TULLE) +
      straightLineTravel.km(TULLE, HOME);
    expect(sim?.km).toBeCloseTo(expected, 6);
    expect(sim?.items[0]?.start).toBeGreaterThanOrEqual(H(13, 30));
  });

  it("rejects a visit that makes us late for a fixed appointment", () => {
    const ctx = createContext(state({ places: [TULLE, MALEMORT] }));
    const fixed = apptTask(
      ctx,
      appt(
        "f",
        { kind: "FIXED", date: MON, time: H(11) },
        { placeId: "malemort" },
      ),
    );
    const day = oneDay(ctx, MON, NONE, fixed ? [fixed] : []);
    const at = (s: number) =>
      simulate(ctx, day, [{ ...task(ctx, "v", "tulle"), fixedStart: s }]);
    expect(simulate(ctx, day, [])).not.toBeNull();
    expect(at(H(9, 15))).not.toBeNull();
    expect(at(H(9, 45))).toBeNull();
  });

  it("lets us drive during the lunch break to arrive on time", () => {
    const ctx = createContext(state({ places: [TULLE, MALEMORT] }));
    const fixed = apptTask(
      ctx,
      appt(
        "f",
        { kind: "FIXED", date: MON, time: H(13, 30) },
        { placeId: "tulle" },
      ),
    );
    const day = oneDay(ctx, MON, NONE, fixed ? [fixed] : []);
    const v = { ...task(ctx, "v", "malemort"), fixedStart: H(11, 30) };
    const sim = simulate(ctx, day, [v]);
    expect(sim?.items[0]).toMatchObject({ start: H(11, 30), end: H(12, 30) });
  });

  it("does not make a day unusable because of an evening appointment", () => {
    const ctx = createContext(state({ places: [MALEMORT] }));
    const fixed = apptTask(
      ctx,
      appt(
        "f",
        { kind: "FIXED", date: MON, time: H(19) },
        { placeId: "office" },
      ),
    );
    const day = oneDay(ctx, MON, NONE, fixed ? [fixed] : []);
    expect(simulate(ctx, day, [task(ctx, "v", "malemort")])).not.toBeNull();
  });

  it("returns null when an item no longer fits in the day", () => {
    const ctx = createContext(state({ places: [MALEMORT] }));
    const long = task(ctx, "v", "malemort", 60 * 11);
    expect(simulate(ctx, oneDay(ctx), [long])).toBeNull();
  });

  it("honours a fixed start time and refuses it when taken", () => {
    const ctx = createContext(
      state({
        places: [MALEMORT],
        validated: [validatedItem("held", MON, H(15))],
      }),
    );
    const at = (s: number) =>
      simulate(ctx, oneDay(ctx), [
        { ...task(ctx, "v", "malemort"), fixedStart: s },
      ]);
    expect(at(H(10))?.items[0]?.start).toBe(H(10));
    expect(at(H(15))).toBeNull();
  });

  it("uses an injected travel model (IGN matrix later)", () => {
    const flat = { km: () => 10, minutes: () => 15 };
    const other = place("other", 0, 0);
    const ctx = createContext(state({ places: [other] }), flat);
    const sim = simulate(ctx, oneDay(ctx), [task(ctx, "v", "other")]);
    expect(sim).toMatchObject({ km: 20, finish: H(8, 30) + 15 + 60 + 15 });
  });
});
