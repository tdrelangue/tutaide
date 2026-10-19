import { describe, expect, it } from "vitest";
import { mapAppointment, mapAppointments } from "../bridge/map/appointments";
import { apptRow, day } from "./map-fixtures";

const withParts = (over: Parameters<typeof apptRow>[0] = {}, ids: string[] = []) => ({
  ...apptRow(over),
  participants: ids.map((contactId) => ({ contactId })),
});

describe("mapAppointment place", () => {
  it("maps fixed appointments at the office", () => {
    const { value, issues } = mapAppointment(withParts({}, ["c1", "c2"]));
    expect(issues).toEqual([]);
    expect(value).toEqual({
      id: "ap1",
      title: "Juge",
      participants: ["c1", "c2"],
      placeId: "office",
      dur: 45,
      when: { kind: "FIXED", date: "2026-11-03", time: 600 },
      priority: "HIGH",
    });
  });

  it("maps the fixed place kinds to engine ids", () => {
    expect(mapAppointment(withParts({ placeKind: "HOME" })).value?.placeId).toBe("home");
    expect(mapAppointment(withParts({ placeKind: "VISIO" })).value?.placeId).toBe("visio");
  });

  it("uses the place row id for PLACE", () => {
    expect(mapAppointment(withParts({ placeKind: "PLACE", placeId: "pl9" })).value?.placeId).toBe("pl9");
  });

  it("reports PLACE_MISSING and skips", () => {
    const r = mapAppointment(withParts({ placeKind: "PLACE", placeId: null }));
    expect(r.value).toBeNull();
    expect(r.issues).toEqual([{ kind: "appointment", id: "ap1", reason: "PLACE_MISSING" }]);
  });
});

describe("mapAppointment when", () => {
  it("maps WEEK and RANGE", () => {
    const range = { fromDate: day("2026-11-02"), toDate: day("2026-11-08") };
    expect(mapAppointment(withParts({ whenKind: "WEEK", ...range })).value?.when).toEqual({
      kind: "WEEK",
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(mapAppointment(withParts({ whenKind: "RANGE", ...range })).value?.when.kind).toBe("RANGE");
  });

  it("reports BAD_WHEN for incomplete rows", () => {
    for (const over of [
      { whenKind: "FIXED" as const, date: null },
      { whenKind: "FIXED" as const, timeMin: null },
      { whenKind: "WEEK" as const, fromDate: day("2026-11-02"), toDate: null },
      { whenKind: "RANGE" as const, fromDate: null, toDate: day("2026-11-02") },
    ]) {
      const r = mapAppointment(withParts(over));
      expect(r.value).toBeNull();
      expect(r.issues).toEqual([{ kind: "appointment", id: "ap1", reason: "BAD_WHEN" }]);
    }
  });

  it("reports both problems at once", () => {
    const r = mapAppointment(withParts({ placeKind: "PLACE", whenKind: "FIXED", date: null }));
    expect(r.issues.map((i) => i.reason)).toEqual(["PLACE_MISSING", "BAD_WHEN"]);
  });
});

describe("mapAppointments", () => {
  it("keeps good rows and reports bad ones", () => {
    const rows = [withParts({ id: "a" }), withParts({ id: "b", date: null }), withParts({ id: "c" })];
    const { values, issues } = mapAppointments(rows);
    expect(values.map((a) => a.id)).toEqual(["a", "c"]);
    expect(issues).toEqual([{ kind: "appointment", id: "b", reason: "BAD_WHEN" }]);
  });
});
