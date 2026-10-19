// Pure pieces of the bridge: error classes, sealed points, grouping, insertion fingerprint, dates.
import { describe, expect, it, vi } from "vitest";
import type { InsertResult, Slot, ValidatedItem } from "@/lib/agenda-engine/domain";
import { encrypt } from "@/lib/encryption";
import { todayIn } from "../bridge/dates";
import { AgendaConflict, AgendaRefusal, AgendaUserError, isForeignKeyOrMissing, isUniqueViolation, rethrowAsConflict } from "../bridge/errors";
import { groupBy } from "../bridge/issues";
import { insertionFingerprint } from "../bridge/ops/insert";
import { parsePeriod } from "../bridge/period";
import { unsealPoint, sealPoint } from "../sealed";
import * as service from "../service";

describe("error classes", () => {
  it("AgendaConflict and AgendaRefusal are AgendaUserErrors with their own name", () => {
    const conflict = new AgendaConflict("c");
    const refusal = new AgendaRefusal("r");
    expect(conflict).toBeInstanceOf(AgendaUserError);
    expect(refusal).toBeInstanceOf(AgendaUserError);
    expect([conflict.name, refusal.name, new AgendaUserError("u").name]).toEqual(["AgendaConflict", "AgendaRefusal", "AgendaUserError"]);
    expect(conflict.message).toBe("c");
  });

  it("service still exports the same AgendaRefusal class", () => {
    expect(service.AgendaRefusal).toBe(AgendaRefusal);
  });

  it("recognises Prisma's unique, foreign-key and missing-record codes", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isForeignKeyOrMissing({ code: "P2003" })).toBe(true);
    expect(isForeignKeyOrMissing({ code: "P2025" })).toBe(true);
    expect(isForeignKeyOrMissing({ code: "P2002" })).toBe(false);
    expect([null, undefined, "P2003", 3, new Error("x")].some(isForeignKeyOrMissing)).toBe(false);
  });

  it("rethrowAsConflict turns the three races into AgendaConflict and leaves other errors alone", () => {
    for (const code of ["P2002", "P2003", "P2025"]) {
      expect(() => rethrowAsConflict({ code }, "look again")).toThrow(AgendaConflict);
    }
    const other = new Error("boom");
    expect(() => rethrowAsConflict(other, "look again")).toThrow(other);
  });
});

describe("unsealPoint", () => {
  it("round-trips a valid point, including the extremes", () => {
    expect(unsealPoint(sealPoint({ lat: 50.6372, lon: 3.0633 }))).toEqual({ lat: 50.6372, lon: 3.0633 });
    expect(unsealPoint(sealPoint({ lat: -90, lon: 180 }))).toEqual({ lat: -90, lon: 180 });
  });

  it("is null for no value", () => {
    expect(unsealPoint(null)).toBeNull();
    expect(unsealPoint("")).toBeNull();
  });

  it("throws unless there are exactly two finite numbers within range", () => {
    for (const bad of ["1", "1,2,3", ",2", "1,", "a,b", "NaN,1", "Infinity,1", "90.5,0", "-91,0", "0,180.1", "0,-181", " , "]) {
      expect(() => unsealPoint(encrypt(bad)), bad).toThrow("Malformed agenda point");
    }
  });
});

describe("groupBy", () => {
  it("groups rows by key in order, leaves null keys out and does not mutate the input", () => {
    const rows = [{ k: "a", n: 1 }, { k: null, n: 2 }, { k: "b", n: 3 }, { k: "a", n: 4 }];
    const groups = groupBy(rows, (r) => r.k);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")?.map((r) => r.n)).toEqual([1, 4]);
    expect(rows).toHaveLength(4);
  });
});

describe("parsePeriod", () => {
  it("accepts one day and 31 days, refuses 32, reversed, impossible or non-string dates", () => {
    expect(parsePeriod({ from: "2026-10-19", to: "2026-10-19" })).toEqual({ from: "2026-10-19", to: "2026-10-19" });
    expect(parsePeriod({ from: "2026-10-19", to: "2026-11-18" })).not.toBeNull();
    expect(parsePeriod({ from: "2026-10-19", to: "2026-11-19" })).toBeNull();
    expect(parsePeriod({ from: "2026-10-20", to: "2026-10-19" })).toBeNull();
    expect(parsePeriod({ from: "2026-02-30", to: "2026-03-02" })).toBeNull();
    expect(parsePeriod({ from: 1, to: null })).toBeNull();
    expect(parsePeriod(undefined)).toBeNull();
  });
});

describe("todayIn", () => {
  it("throws when the formatter gives no day part instead of building a malformed date", () => {
    const original = Intl.DateTimeFormat;
    const fake = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      // The spy replaces the constructor by a stub that only implements what todayIn calls.
      () => ({ formatToParts: () => [{ type: "year", value: "2026" }, { type: "month", value: "10" }] }) as unknown as Intl.DateTimeFormat,
    );
    try {
      expect(() => todayIn("Europe/Paris", new Date("2026-10-19T08:00:00Z"))).toThrow(RangeError);
    } finally {
      fake.mockRestore();
    }
    expect(Intl.DateTimeFormat).toBe(original);
  });
});

describe("insertionFingerprint", () => {
  const slot = (date: string, start: number): Slot => ({ date, start, end: start + 60 });
  const item = (id: string): ValidatedItem => ({ id } as unknown as ValidatedItem); // only `id` is read
  // Same: only the rule, task and date identifiers are read by the fingerprint.
  const bent = (ruleId: string) => ({ rule: { id: ruleId }, task: { id: "t1" }, date: "2026-10-20" }) as unknown as InsertResult["bent"][number];

  it("is stable whatever the key order or the extra fields of the slot", () => {
    const a: InsertResult = { placement: slot("2026-10-20", 600), changes: [{ item: item("x"), to: slot("2026-10-21", 540) }], bent: [] };
    const reordered = { bent: [], changes: [{ to: { end: 600, start: 540, date: "2026-10-21" }, item: item("x") }], placement: { end: 660, start: 600, date: "2026-10-20", addKm: 3 } };
    expect(insertionFingerprint(reordered)).toBe(insertionFingerprint(a));
    expect(insertionFingerprint(a)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes with the placement, a move, a removal and the bent rules (in any order)", () => {
    const base: InsertResult = { placement: slot("2026-10-20", 600), changes: [], bent: [] };
    const prints = new Set([
      insertionFingerprint(base),
      insertionFingerprint({ ...base, placement: slot("2026-10-20", 660) }),
      insertionFingerprint({ ...base, changes: [{ item: item("x"), to: slot("2026-10-21", 540) }] }),
      insertionFingerprint({ ...base, changes: [{ item: item("x"), to: null }] }),
      insertionFingerprint({ ...base, bent: [bent("r1")] }),
      insertionFingerprint({ ...base, bent: [bent("r2")] }),
    ]);
    expect(prints.size).toBe(6);
    expect(insertionFingerprint({ ...base, bent: [bent("r1"), bent("r2")] })).toBe(insertionFingerprint({ ...base, bent: [bent("r2"), bent("r1")] }));
  });
});
