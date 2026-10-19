import { describe, expect, it } from "vitest";
import { daysInclusive, fromIso, isIsoDow, isRealDate, todayIn, toIso } from "../bridge/dates";

describe("toIso / fromIso", () => {
  it("formats the UTC parts of a date", () => {
    expect(toIso(new Date(Date.UTC(2026, 9, 19, 23, 59, 59)))).toBe("2026-10-19");
    expect(toIso(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
  });

  it("parses an ISO date at UTC midnight", () => {
    expect(fromIso("2026-02-28").toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("round-trips, including a leap day", () => {
    expect(toIso(fromIso("2028-02-29"))).toBe("2028-02-29");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => fromIso("2026-02-31")).toThrow(RangeError);
    expect(() => fromIso("19/10/2026")).toThrow(RangeError);
    expect(() => fromIso("")).toThrow(RangeError);
  });
});

describe("isRealDate / daysInclusive", () => {
  it("accepts real days only", () => {
    expect(isRealDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-1-1", "", "19/10/2026", "2026-10-19T00:00"]) {
      expect(isRealDate(bad), bad).toBe(false);
    }
  });

  it("counts both ends", () => {
    expect(daysInclusive("2026-10-19", "2026-10-19")).toBe(1);
    expect(daysInclusive("2026-10-19", "2026-11-18")).toBe(31);
  });
});

describe("isIsoDow", () => {
  it("accepts 1..7 integers only", () => {
    expect([1, 4, 7].every(isIsoDow)).toBe(true);
    expect([0, 8, 2.5, -1, null, Number.NaN].some(isIsoDow)).toBe(false);
  });
});

describe("todayIn", () => {
  const at = (iso: string): Date => new Date(iso);

  it("is the next day in Paris when UTC is 23:30 (summer, UTC+2)", () => {
    expect(todayIn("Europe/Paris", at("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  it("is the next day in Paris when UTC is 23:30 (winter, UTC+1)", () => {
    expect(todayIn("Europe/Paris", at("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });

  it("switches exactly at local midnight (winter and summer)", () => {
    expect(todayIn("Europe/Paris", at("2026-01-15T22:59:59Z"))).toBe("2026-01-15");
    expect(todayIn("Europe/Paris", at("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
    expect(todayIn("Europe/Paris", at("2026-06-30T21:59:59Z"))).toBe("2026-06-30");
    expect(todayIn("Europe/Paris", at("2026-06-30T22:00:00Z"))).toBe("2026-07-01");
  });

  it("follows the spring clock change (2026-03-29)", () => {
    expect(todayIn("Europe/Paris", at("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(todayIn("Europe/Paris", at("2026-03-29T21:59:59Z"))).toBe("2026-03-29");
    expect(todayIn("Europe/Paris", at("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
  });

  it("follows the autumn clock change (2026-10-25)", () => {
    expect(todayIn("Europe/Paris", at("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Paris", at("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Paris", at("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });

  it("works for zones ahead of and behind UTC", () => {
    expect(todayIn("Pacific/Auckland", at("2026-01-15T12:00:00Z"))).toBe("2026-01-16");
    expect(todayIn("America/New_York", at("2026-01-15T03:00:00Z"))).toBe("2026-01-14");
    expect(todayIn("UTC", at("2026-01-15T03:00:00Z"))).toBe("2026-01-15");
  });

  it("throws on an unknown timezone", () => {
    expect(() => todayIn("Mars/Olympus", at("2026-01-15T03:00:00Z"))).toThrow(RangeError);
  });
});
