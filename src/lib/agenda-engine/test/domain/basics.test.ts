import { describe, expect, it } from "vitest";
import {
  addDays,
  availWindows,
  createContext,
  diffDays,
  eachDay,
  intersect,
  isoDow,
  straightLineTravel,
  haversineKm,
  VISIO,
  apptTask,
} from "../../domain";
import type { Appointment, PlannerContext, Task } from "../../domain";
import {
  H,
  HOME,
  MALEMORT,
  TULLE,
  WEEKDAYS,
  appt,
  contact,
  place,
  protege,
  state,
} from "./fixtures";

describe("dates", () => {
  it("adds days across months, years and the October clock change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("rounds fractional day offsets", () => {
    expect(addDays("2026-10-19", 30.4)).toBe("2026-11-18");
    expect(addDays("2026-10-19", -2.1)).toBe("2026-10-17");
  });
  it("counts days between dates", () => {
    expect(diffDays("2026-11-01", "2026-10-19")).toBe(13);
    expect(diffDays("2026-10-19", "2026-11-01")).toBe(-13);
  });
  it("gives ISO days of the week", () => {
    expect(isoDow("2026-10-19")).toBe(1);
    expect(isoDow("2026-10-25")).toBe(7);
    expect(isoDow("1970-01-01")).toBe(4);
  });
  it("lists every day of a period, bounds included", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(eachDay("2026-11-02", "2026-10-30")).toEqual([]);
  });
  it("rejects malformed dates", () => {
    expect(() => addDays("19/10/2026", 1)).toThrow(RangeError);
    expect(() => addDays("2026-02-31", 1)).toThrow(RangeError);
    expect(() => diffDays("2026-13-01", "2026-01-01")).toThrow(RangeError);
  });
});

describe("straight-line travel", () => {
  it("measures Brive → Tulle as road distance (straight line × 1.3)", () => {
    const straight = haversineKm(HOME, TULLE);
    expect(straight).toBeGreaterThan(20);
    expect(straight).toBeLessThan(25);
    expect(straightLineTravel.km(HOME, TULLE)).toBeCloseTo(straight * 1.3, 6);
  });
  it("adds parking time to the drive, and nothing for the same place", () => {
    const km = straightLineTravel.km(HOME, TULLE);
    expect(straightLineTravel.minutes(HOME, TULLE)).toBe(
      Math.round((km / 55) * 60 + 6),
    );
    expect(straightLineTravel.minutes(HOME, HOME)).toBe(0);
  });
  it("counts no travel for a video call", () => {
    expect(straightLineTravel.km(HOME, VISIO)).toBe(0);
    expect(straightLineTravel.minutes(VISIO, TULLE)).toBe(0);
  });
});

describe("availability", () => {
  it("intersects window lists", () => {
    expect(
      intersect(
        [
          [H(9), H(12)],
          [H(14), H(17)],
        ],
        [[H(11), H(15)]],
      ),
    ).toEqual([
      [H(11), H(12)],
      [H(14), H(15)],
    ]);
  });

  const bank = place("bank", 45.1595, 1.535, "Banque");
  const son = contact(
    "son",
    "Marc Bonneau",
    "FAMILLE",
    [],
    [{ dows: WEEKDAYS, from: H(17), to: H(19) }],
  );
  const banker = contact(
    "banker",
    "Agence",
    "PRO",
    [bank],
    [
      { dows: WEEKDAYS, from: H(9), to: H(12) },
      { dows: WEEKDAYS, from: H(14), to: H(17) },
    ],
  );

  it("finds no common slot between a son free after 17:00 and a bank open 9–12 / 14–17", () => {
    const ctx = createContext(state({ contacts: [son, banker] }));
    const task = taskFor(
      ctx,
      appt(
        "bank",
        { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" },
        { participants: ["son", "banker"], placeId: "bank" },
      ),
    );
    expect(availWindows(ctx, task, "2026-10-20")).toEqual([]);
  });

  it("keeps the son's evening window within working hours", () => {
    const ctx = createContext(state({ contacts: [son] }));
    const task = taskFor(
      ctx,
      appt(
        "x",
        { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" },
        { participants: ["son"], dur: 60 },
      ),
    );
    expect(availWindows(ctx, task, "2026-10-20")).toEqual([[H(17), H(18, 30)]]);
    expect(availWindows(ctx, task, "2026-10-24")).toEqual([]);
  });

  it("respects « pas avant 10 h »", () => {
    const aude = protege("aude", "Aude Javel", {
      at: MALEMORT,
      last: "2026-10-01",
      notBefore: H(10),
    });
    const ctx = createContext(state({ contacts: [aude] }));
    const task = taskFor(
      ctx,
      appt(
        "v",
        { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" },
        { participants: ["aude"] },
      ),
    );
    expect(availWindows(ctx, task, "2026-10-20")).toEqual([[H(10), H(18, 30)]]);
  });

  it("ignores a participant that no longer exists", () => {
    const ctx = createContext(state());
    const task = taskFor(
      ctx,
      appt(
        "v",
        { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" },
        { participants: ["ghost"] },
      ),
    );
    expect(availWindows(ctx, task, "2026-10-20")).toEqual([
      [H(8, 30), H(18, 30)],
    ]);
  });
});

function taskFor(ctx: PlannerContext, a: Appointment): Task {
  const task = apptTask(ctx, a);
  if (!task) throw new Error(`unknown place for ${a.id}`);
  return task;
}
