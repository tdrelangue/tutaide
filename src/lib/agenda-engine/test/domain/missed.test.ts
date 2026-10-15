import { describe, expect, it } from "vitest";
import {
  buildTasks,
  createContext,
  lastSeen,
  markMissed,
  nextWeek,
  solve,
  staleAppointments,
} from "../../domain";
import type { PlannerState } from "../../domain";
import {
  FRI,
  H,
  MALEMORT,
  MON,
  appt,
  protege,
  settings,
  state,
  validatedItem,
} from "./fixtures";

const TODAY = "2026-10-15";
const jean = protege("jean", "Jean Bonneau", {
  at: MALEMORT,
  last: "2026-09-14",
});
const visit = validatedItem("jean@2026-10-14", "2026-10-14", H(10), {
  participants: ["jean"],
  personId: "jean",
  title: "Visite à Jean Bonneau",
});

const s = (): PlannerState => state({ contacts: [jean], validated: [visit] });

function missed(st: PlannerState, id: string, today = TODAY): PlannerState {
  const res = markMissed(st, id, today);
  if (!res.ok) throw new Error(`markMissed refused: ${res.reason}`);
  return res.state;
}

describe("« N'a pas eu lieu »", () => {
  it("keeps the item in history as cancelled and takes it off the calendar", () => {
    const next = missed(s(), visit.id);
    expect(next.validated).toEqual([]);
    expect(next.past).toEqual([
      {
        id: visit.id,
        apptId: null,
        held: false,
        kind: "VISIT",
        title: visit.title,
        participants: ["jean"],
        date: "2026-10-14",
        start: H(10),
        end: H(11),
      },
    ]);
  });

  it("no longer counts as a visit: the next one is due again from the last real visit", () => {
    expect(lastSeen(createContext(s()), jean).date).toBe("2026-10-14");
    expect(lastSeen(createContext(missed(s(), visit.id)), jean).date).toBe(
      "2026-09-14",
    );
  });

  it("brings the visit back at once, at Normale priority at least", () => {
    const { tasks } = buildTasks(
      createContext(missed(s(), visit.id)),
      MON,
      FRI,
      new Set(),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "jean@2026-10-14",
      priority: "NORMAL",
      rescheduled: true,
      earliest: MON,
    });
  });

  it("is never postponed quietly a second time", () => {
    const busy = {
      ...missed(s(), visit.id),
      settings: settings({ workDays: [1] }),
    };
    const plan = solve(
      createContext({
        ...busy,
        rules: [
          {
            id: "off",
            type: "UNAVAILABLE",
            label: "Off",
            dow: 1,
            allDay: true,
            strength: "MEDIUM",
          },
        ],
      }),
      MON,
      FRI,
    );
    expect(plan.postponed).toEqual([]);
    expect(plan.days[0]?.items.map((i) => i.task.id)).toEqual([
      "jean@2026-10-14",
    ]);
    expect(plan.bent.map((b) => b.rule.id)).toEqual(["off"]);
  });

  it("can be marked days later, once the item is already in history", () => {
    const held: PlannerState = state({
      contacts: [jean],
      past: [
        {
          id: "h1",
          apptId: null,
          held: true,
          kind: "VISIT",
          title: "Visite",
          participants: ["jean"],
          date: "2026-10-14",
          start: H(10),
          end: H(11),
        },
      ],
    });
    const next = missed(held, "h1", "2026-10-22");
    expect(next.past[0]?.held).toBe(false);
    expect(lastSeen(createContext(next), jean).date).toBe("2026-09-14");
    expect(markMissed(next, "h1", "2026-10-22")).toEqual({
      ok: false,
      reason: "UNKNOWN_ITEM",
    });
  });

  it("puts a missed appointment back « à placer », by default the following week", () => {
    const bank = appt(
      "bank",
      { kind: "FIXED", date: "2026-10-14", time: H(9) },
      { participants: ["jean"] },
    );
    const item = validatedItem("bank", "2026-10-14", H(9), {
      kind: "APPT",
      apptId: "bank",
      fixed: true,
    });
    const next = missed(
      state({ appointments: [bank], validated: [item] }),
      "bank",
    );
    expect(next.appointments[0]?.when).toEqual({
      kind: "RANGE",
      from: "2026-10-19",
      to: "2026-10-23",
    });
    const archived = state({
      appointments: [bank],
      past: [
        {
          id: "bank",
          apptId: null,
          held: true,
          kind: "APPT",
          title: "Banque",
          participants: [],
          date: "2026-10-14",
          start: H(9),
          end: H(10),
        },
      ],
    });
    const chosen = markMissed(archived, "bank", TODAY, {
      from: "2026-11-02",
      to: "2026-11-06",
    });
    expect(chosen.ok && chosen.state.appointments[0]?.when).toEqual({
      kind: "RANGE",
      from: "2026-11-02",
      to: "2026-11-06",
    });
  });

  it("refuses a future item (delete it instead) and an unknown one", () => {
    const future = state({
      validated: [validatedItem("f", "2026-10-20", H(9))],
    });
    expect(markMissed(future, "f", TODAY)).toEqual({
      ok: false,
      reason: "FUTURE",
    });
    expect(markMissed(future, "nope", TODAY)).toEqual({
      ok: false,
      reason: "UNKNOWN_ITEM",
    });
  });

  it("computes the following week from any day", () => {
    expect(nextWeek("2026-10-18")).toEqual({
      from: "2026-10-19",
      to: "2026-10-23",
    });
    expect(nextWeek("2026-10-19")).toEqual({
      from: "2026-10-26",
      to: "2026-10-30",
    });
  });

  it("says whether an appointment went back « à placer »", () => {
    const item = validatedItem("x", "2026-10-14", H(9), {
      kind: "APPT",
      apptId: "gone",
    });
    const res = markMissed(state({ validated: [item] }), "x", TODAY);
    expect(res).toMatchObject({ ok: true, requeued: false });
    const visitRes = markMissed(s(), visit.id, TODAY);
    expect(visitRes).toMatchObject({ ok: true, requeued: false });
    const bank = appt("bank", {
      kind: "FIXED",
      date: "2026-10-14",
      time: H(9),
    });
    const linked = validatedItem("v-bank", "2026-10-14", H(9), {
      kind: "APPT",
      apptId: "bank",
    });
    const back = markMissed(
      state({ appointments: [bank], validated: [linked] }),
      "v-bank",
      TODAY,
    );
    expect(back).toMatchObject({ ok: true, requeued: true });
    expect(back.ok && back.state.past[0]?.apptId).toBe("bank");
  });
});

describe("staleAppointments", () => {
  it("lists appointments whose dates passed without being planned or held", () => {
    const never = appt("never", {
      kind: "RANGE",
      from: "2026-10-05",
      to: "2026-10-09",
    });
    const held = appt("held", {
      kind: "FIXED",
      date: "2026-10-06",
      time: H(9),
    });
    const planned = appt("planned", {
      kind: "FIXED",
      date: "2026-10-07",
      time: H(9),
    });
    const upcoming = appt("upcoming", {
      kind: "WEEK",
      from: "2026-10-12",
      to: "2026-10-16",
    });
    const st = state({
      appointments: [never, held, planned, upcoming],
      past: [
        {
          id: "h",
          apptId: "held",
          held: true,
          kind: "APPT",
          title: "",
          participants: [],
          date: "2026-10-06",
          start: 0,
          end: 60,
        },
      ],
      validated: [
        validatedItem("planned", "2026-10-07", H(9), {
          kind: "APPT",
          apptId: "planned",
        }),
      ],
    });
    expect(staleAppointments(st, TODAY).map((a) => a.id)).toEqual(["never"]);
  });
});
