import { describe, expect, it } from "vitest";
import { mapRule, mapRules } from "../bridge/map/rules";
import { day, ruleRow } from "./map-fixtures";

const reasons = (r: ReturnType<typeof mapRule>) => r.issues.map((i) => i.reason);

describe("mapRule UNAVAILABLE", () => {
  it("maps an all-day rule", () => {
    const { value, issues } = mapRule(ruleRow());
    expect(issues).toEqual([]);
    expect(value).toEqual({
      id: "r1",
      label: "Mercredi",
      strength: "HARD",
      type: "UNAVAILABLE",
      dow: 3,
      allDay: true,
    });
  });

  it("ignores hour columns of an all-day rule", () => {
    const { value } = mapRule(ruleRow({ fromMin: 600, toMin: 700 }));
    expect(value).not.toHaveProperty("from");
  });

  it("maps an hours rule with atOffice", () => {
    const row = ruleRow({ allDay: false, fromMin: 840, toMin: 1020, atOffice: true, strength: "MEDIUM" });
    expect(mapRule(row).value).toEqual({
      id: "r1",
      label: "Mercredi",
      strength: "MEDIUM",
      type: "UNAVAILABLE",
      dow: 3,
      allDay: false,
      from: 840,
      to: 1020,
      atOffice: true,
    });
  });

  it("treats a null allDay as hours", () => {
    expect(mapRule(ruleRow({ allDay: null, fromMin: 60, toMin: 120 })).value).toMatchObject({ allDay: false });
  });

  it("rejects missing, reversed or empty hours", () => {
    for (const over of [
      { allDay: false, fromMin: null, toMin: 100 },
      { allDay: false, fromMin: 100, toMin: null },
      { allDay: false, fromMin: 700, toMin: 700 },
      { allDay: false, fromMin: 800, toMin: 700 },
    ]) {
      const r = mapRule(ruleRow(over));
      expect(r.value).toBeNull();
      expect(reasons(r)).toEqual(["BAD_RULE"]);
    }
  });

  it("flags rules the engine cannot express", () => {
    for (const over of [{ dow: null }, { fromDate: day("2026-12-01") }, { toDate: day("2026-12-02") }]) {
      const r = mapRule(ruleRow(over));
      expect(r.value).toBeNull();
      expect(r.issues).toEqual([{ kind: "rule", id: "r1", reason: "UNSUPPORTED_RULE" }]);
    }
  });

  it("rejects an out-of-range weekday", () => {
    expect(reasons(mapRule(ruleRow({ dow: 9 })))).toEqual(["BAD_RULE"]);
  });
});

describe("mapRule MAX_VISITS", () => {
  const max = { type: "MAX_VISITS" as const, allDay: null, maxVisits: 3, label: "Max" };

  it("maps a visit cap", () => {
    expect(mapRule(ruleRow(max)).value).toEqual({
      id: "r1",
      label: "Max",
      strength: "HARD",
      type: "MAX_VISITS",
      dow: 3,
      max: 3,
    });
  });

  it("accepts a zero cap", () => {
    expect(mapRule(ruleRow({ ...max, maxVisits: 0 })).value).toMatchObject({ max: 0 });
  });

  it("rejects a missing or negative cap", () => {
    expect(reasons(mapRule(ruleRow({ ...max, maxVisits: null })))).toEqual(["BAD_RULE"]);
    expect(reasons(mapRule(ruleRow({ ...max, maxVisits: -1 })))).toEqual(["BAD_RULE"]);
  });

  it("flags a cap without weekday or with dates as unsupported", () => {
    expect(reasons(mapRule(ruleRow({ ...max, dow: null })))).toEqual(["UNSUPPORTED_RULE"]);
    expect(reasons(mapRule(ruleRow({ ...max, fromDate: day("2026-12-01") })))).toEqual(["UNSUPPORTED_RULE"]);
  });
});

describe("mapRule VACATION", () => {
  const vac = {
    type: "VACATION" as const,
    label: "Noël",
    dow: null,
    allDay: null,
    fromDate: day("2026-12-24"),
    toDate: day("2027-01-02"),
  };

  it("maps holidays and forces them imperative", () => {
    expect(mapRule(ruleRow({ ...vac, strength: "SOFT" })).value).toEqual({
      id: "r1",
      label: "Noël",
      strength: "HARD",
      type: "VACATION",
      from: "2026-12-24",
      to: "2027-01-02",
    });
  });

  it("accepts a one-day vacation", () => {
    expect(mapRule(ruleRow({ ...vac, toDate: vac.fromDate })).value).toMatchObject({ to: "2026-12-24" });
  });

  it("rejects missing or reversed dates", () => {
    for (const over of [{ fromDate: null }, { toDate: null }, { fromDate: day("2027-02-01") }]) {
      const r = mapRule(ruleRow({ ...vac, ...over }));
      expect(r.value).toBeNull();
      expect(reasons(r)).toEqual(["BAD_RULE"]);
    }
  });
});

describe("mapRules", () => {
  it("keeps the good rules and reports the bad ones", () => {
    const rows = [ruleRow({ id: "ok" }), ruleRow({ id: "bad", dow: null }), ruleRow({ id: "ok2", dow: 1 })];
    const { values, issues } = mapRules(rows);
    expect(values.map((r) => r.id)).toEqual(["ok", "ok2"]);
    expect(issues).toEqual([{ kind: "rule", id: "bad", reason: "UNSUPPORTED_RULE" }]);
  });

  it("handles an empty list", () => {
    expect(mapRules([])).toEqual({ values: [], issues: [] });
  });
});
