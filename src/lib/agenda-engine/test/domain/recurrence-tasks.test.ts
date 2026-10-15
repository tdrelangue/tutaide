import { describe, expect, it } from "vitest";
import {
  buildTasks,
  createContext,
  intervalDays,
  lastSeen,
  nextVisitDue,
} from "../../domain";
import {
  H,
  MALEMORT,
  MON,
  OBJAT,
  SUN4,
  appt,
  protege,
  state,
  validatedItem,
} from "./fixtures";

const jean = protege("jean", "Jean Bonneau", {
  at: MALEMORT,
  last: "2026-09-22",
});
const marc = protege("marc", "Marc Assin", {
  at: OBJAT,
  last: "2026-07-21",
  period: "QUARTER",
});

describe("recurrence: next visit = last appointment with the person + frequency", () => {
  it("spreads several visits over the period", () => {
    expect(
      intervalDays({
        count: 1,
        period: "MONTH",
        lastVisit: MON,
        priority: "LOW",
        minutes: null,
      }),
    ).toBe(30.4);
    expect(
      intervalDays({
        count: 2,
        period: "MONTH",
        lastVisit: MON,
        priority: "LOW",
        minutes: null,
      }),
    ).toBe(15.2);
    expect(
      intervalDays({
        count: 1,
        period: "WEEK",
        lastVisit: MON,
        priority: "LOW",
        minutes: null,
      }),
    ).toBe(7);
    expect(
      intervalDays({
        count: 1,
        period: "YEAR",
        lastVisit: MON,
        priority: "LOW",
        minutes: null,
      }),
    ).toBe(365);
  });

  it("starts from the last visit on file when nothing else is known", () => {
    const ctx = createContext(state({ contacts: [jean] }));
    expect(lastSeen(ctx, jean)).toEqual({ date: "2026-09-22", source: null });
    expect(nextVisitDue(ctx, jean)).toBe("2026-10-22");
  });

  it("restarts a quarterly cycle from an urgent signature held 2 months later", () => {
    const ctx = createContext(
      state({
        contacts: [marc],
        past: [
          {
            id: "sig",
            apptId: null,
            held: true,
            kind: "APPT",
            title: "Signature",
            participants: ["marc"],
            date: "2026-09-21",
            start: H(10),
            end: H(11),
          },
        ],
      }),
    );
    expect(lastSeen(ctx, marc)).toEqual({
      date: "2026-09-21",
      source: "Signature",
    });
    expect(nextVisitDue(ctx, marc)).toBe("2026-12-21");
  });

  it("counts as « vu » only validated items whose date has passed", () => {
    const ctx = createContext(
      state({
        today: "2026-10-15",
        contacts: [jean],
        validated: [
          validatedItem("v1", "2026-10-05", H(10), {
            participants: ["jean"],
            title: "Visite validée",
          }),
          validatedItem("v2", "2026-10-20", H(10), {
            participants: ["jean"],
            title: "Visite prévue",
          }),
        ],
        appointments: [
          appt(
            "a1",
            { kind: "RANGE", from: "2026-10-12", to: "2026-10-14" },
            { participants: ["jean"] },
          ),
          appt(
            "a2",
            { kind: "FIXED", date: "2026-10-08", time: H(9) },
            { participants: ["jean"] },
          ),
        ],
      }),
    );
    expect(lastSeen(ctx, jean)).toEqual({
      date: "2026-10-05",
      source: "Visite validée",
    });
  });

  it("lets an appointment with the person stand for the visit: the countdown restarts from it", () => {
    const ctx = createContext(
      state({
        contacts: [jean],
        appointments: [
          appt(
            "a1",
            { kind: "FIXED", date: "2026-10-01", time: H(9) },
            { participants: ["jean"] },
          ),
          appt(
            "a2",
            { kind: "RANGE", from: "2026-10-12", to: "2026-10-16" },
            { participants: ["jean", "son"] },
          ),
        ],
      }),
    );
    // Not validated: never « vu »…
    expect(lastSeen(ctx, jean).date).toBe("2026-09-22");
    // …but it takes the place of the visit, so the next one counts from it.
    expect(nextVisitDue(ctx, jean)).toBe("2026-11-11");
  });

  it("counts the next visit from a validated future one (« prévu »), so it is never proposed twice", () => {
    const ctx = createContext(
      state({
        today: "2026-10-15",
        contacts: [jean],
        validated: [
          validatedItem("v2", "2026-10-20", H(10), {
            participants: ["jean"],
            title: "Visite prévue",
          }),
        ],
      }),
    );
    expect(lastSeen(ctx, jean).date).toBe("2026-09-22");
    expect(nextVisitDue(ctx, jean)).toBe("2026-11-19");
    expect(
      buildTasks(ctx, "2026-10-26", "2026-11-06", new Set()).tasks,
    ).toEqual([]);
  });

  it("returns null for a contact without regular visits", () => {
    const ctx = createContext(state({ contacts: [jean] }));
    expect(nextVisitDue(ctx, { ...jean, visits: null })).toBeNull();
  });
});

describe("buildTasks", () => {
  it("creates monthly visits around their due date", () => {
    const ctx = createContext(state({ contacts: [jean] }));
    const { tasks } = buildTasks(ctx, MON, SUN4, new Set());
    expect(tasks.map((t) => [t.id, t.earliest, t.latest, t.priority])).toEqual([
      ["jean@2026-10-22", MON, "2026-10-28", "LOW"],
    ]);
    expect(tasks[0]?.overdue).toBe(false);
    expect(tasks[0]?.dur).toBe(60);
  });

  it("brings an overdue visit to the very start of the period", () => {
    const ctx = createContext(state({ contacts: [marc] }));
    const { tasks } = buildTasks(ctx, "2026-11-09", "2026-12-06", new Set());
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "marc@2026-10-20",
      earliest: "2026-11-09",
      latest: "2026-11-12",
      overdue: true,
    });
  });

  it("skips paused, ended and non-protected contacts, and skipped occurrences", () => {
    const paused = protege("p", "Agathe Zeblouse", {
      at: OBJAT,
      last: "2026-09-01",
      status: "PAUSED",
    });
    const ended = protege("e", "Harry Cover", {
      at: OBJAT,
      last: "2026-09-01",
      status: "ENDED",
    });
    const ctx = createContext(
      state({ contacts: [paused, ended, jean], skips: ["jean@2026-10-22"] }),
    );
    expect(buildTasks(ctx, MON, SUN4, new Set()).tasks).toEqual([]);
  });

  it("applies a per-occurrence priority and the person's visit length", () => {
    const long = protege("jean", "Jean Bonneau", {
      at: MALEMORT,
      last: "2026-09-22",
      minutes: 90,
    });
    const ctx = createContext(
      state({
        contacts: [long],
        priorityOverrides: { "jean@2026-10-22": "HIGH" },
      }),
    );
    expect(buildTasks(ctx, MON, SUN4, new Set()).tasks[0]).toMatchObject({
      priority: "HIGH",
      dur: 90,
    });
  });

  it("sorts appointments into fixed events, flexible tasks, already validated and invalid", () => {
    const ctx = createContext(
      state({
        appointments: [
          appt("fixed", { kind: "FIXED", date: "2026-10-20", time: H(14) }),
          appt("outside", { kind: "FIXED", date: "2026-12-20", time: H(14) }),
          appt(
            "week",
            { kind: "WEEK", from: "2026-10-12", to: "2026-10-23" },
            { priority: "HIGH" },
          ),
          appt("later", {
            kind: "RANGE",
            from: "2026-12-01",
            to: "2026-12-03",
          }),
          appt(
            "lost",
            { kind: "WEEK", from: MON, to: "2026-10-23" },
            { placeId: "nowhere" },
          ),
          appt("done", { kind: "WEEK", from: MON, to: "2026-10-23" }),
        ],
        validated: [
          validatedItem("done", "2026-10-21", H(9), {
            apptId: "done",
            kind: "APPT",
          }),
        ],
      }),
    );
    const out = buildTasks(ctx, MON, SUN4, new Set());
    expect(out.fixed.map((f) => [f.id, f.due, f.fixedStart])).toEqual([
      ["fixed", "2026-10-20", H(14)],
    ]);
    expect(
      out.tasks.map((t) => [t.id, t.earliest, t.latest, t.strict, t.priority]),
    ).toEqual([["week", MON, "2026-10-23", true, "HIGH"]]);
    expect(out.held.map((h) => h.id)).toEqual(["done"]);
    expect(out.invalid).toEqual([
      {
        task: null,
        apptId: "lost",
        personId: null,
        priority: "NORMAL",
        reason: "UNKNOWN_PLACE",
      },
    ]);
  });

  it("turns validated items marked movable into tasks and keeps the others held", () => {
    const ctx = createContext(
      state({
        validated: [
          validatedItem("keep", "2026-10-20", H(9)),
          validatedItem("shift", "2026-10-21", H(9), {
            earliest: "2026-10-20",
            latest: "2026-10-23",
          }),
        ],
      }),
    );
    const out = buildTasks(ctx, MON, SUN4, new Set(["shift"]));
    expect(out.held.map((h) => h.id)).toEqual(["keep"]);
    expect(
      out.tasks.map((t) => [
        t.id,
        t.originalDate,
        t.originalStart,
        t.earliest,
        t.latest,
      ]),
    ).toEqual([["shift", "2026-10-21", H(9), "2026-10-20", "2026-10-23"]]);
  });

  it("reports a nonsense frequency or a missing address instead of failing the whole plan", () => {
    const zero = protege("z", "Zéro Pointé", {
      at: OBJAT,
      last: "2026-09-01",
      count: 0,
    });
    const daily = protege("d", "Dédé Quotidien", {
      at: OBJAT,
      last: "2026-09-01",
      count: 40,
      period: "MONTH",
    });
    const homeless = {
      ...protege("h", "Sans Adresse", { at: OBJAT, last: "2026-09-01" }),
      places: [],
    };
    const ctx = createContext(
      state({ contacts: [zero, daily, homeless, jean] }),
    );
    const out = buildTasks(ctx, MON, SUN4, new Set());
    expect(out.invalid.map((u) => [u.personId, u.reason])).toEqual([
      ["z", "INVALID_FREQUENCY"],
      ["d", "INVALID_FREQUENCY"],
      ["h", "NO_ADDRESS"],
    ]);
    expect(out.tasks.map((t) => t.id)).toEqual(["jean@2026-10-22"]);
    expect(nextVisitDue(ctx, zero)).toBeNull();
  });
});
