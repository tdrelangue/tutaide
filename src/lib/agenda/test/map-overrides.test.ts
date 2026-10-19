import type { AgendaOccurrenceOverride, AgendaRuleAnswer } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mapAnswers } from "../bridge/map/answers";
import { mapOverrides } from "../bridge/map/overrides";
import { day } from "./map-fixtures";

const override = (over: Partial<AgendaOccurrenceOverride> = {}): AgendaOccurrenceOverride => ({
  ownerId: "o1",
  occurrenceKey: "c1@2026-11-03",
  contactId: "c1",
  dueOn: day("2026-11-03"),
  skipped: false,
  priority: null,
  ...over,
});

const answer = (over: Partial<AgendaRuleAnswer> = {}): AgendaRuleAnswer => ({
  ownerId: "o1",
  ruleKey: "r1",
  answer: null,
  refused: false,
  ...over,
});

describe("mapOverrides", () => {
  it("collects skips and priorities", () => {
    const rows = [
      override({ skipped: true }),
      override({ occurrenceKey: "c1@2026-12-03", dueOn: day("2026-12-03"), priority: "HIGH" }),
      override({ occurrenceKey: "c2@2026-11-03", contactId: "c2", skipped: true, priority: "LOW" }),
    ];
    expect(mapOverrides(rows)).toEqual({
      skips: ["c1@2026-11-03", "c2@2026-11-03"],
      priorityOverrides: { "c1@2026-12-03": "HIGH", "c2@2026-11-03": "LOW" },
      issues: [],
    });
  });

  it("ignores a row that overrides nothing", () => {
    expect(mapOverrides([override()])).toEqual({ skips: [], priorityOverrides: {}, issues: [] });
  });

  it("reports BAD_KEY and ignores keys that do not match the row", () => {
    const rows = [
      override({ occurrenceKey: "garbage", skipped: true }),
      override({ occurrenceKey: "c9@2026-11-03", skipped: true }),
      override({ occurrenceKey: "c1@2026-11-04", skipped: true }),
      override({ occurrenceKey: "c1@2026-11-03 ", skipped: true }),
    ];
    const r = mapOverrides(rows);
    expect(r.skips).toEqual([]);
    expect(r.issues).toHaveLength(4);
    expect(r.issues[0]).toEqual({ kind: "override", id: "garbage", reason: "BAD_KEY" });
  });

  it("accepts a contact id that itself contains an @", () => {
    const row = override({ occurrenceKey: "a@b@2026-11-03", contactId: "a@b", skipped: true });
    expect(mapOverrides([row]).skips).toEqual(["a@b@2026-11-03"]);
  });

  it("handles an empty list", () => {
    expect(mapOverrides([])).toEqual({ skips: [], priorityOverrides: {}, issues: [] });
  });
});

describe("mapAnswers", () => {
  it("maps answers and refused exceptions", () => {
    const rows = [
      answer({ ruleKey: "r1", answer: "BREAK" }),
      answer({ ruleKey: "r2", answer: "RESPECT" }),
      answer({ ruleKey: "pref:c1", refused: true }),
      answer({ ruleKey: "r3", answer: "BREAK", refused: true }),
      answer({ ruleKey: "r4" }),
    ];
    expect(mapAnswers(rows)).toEqual({
      answers: { r1: "break", r2: "respect", r3: "break" },
      refusedExceptions: ["pref:c1", "r3"],
    });
  });

  it("handles an empty list", () => {
    expect(mapAnswers([])).toEqual({ answers: {}, refusedExceptions: [] });
  });

  it("is safe with a hostile key", () => {
    const { answers } = mapAnswers([answer({ ruleKey: "__proto__", answer: "BREAK" })]);
    expect(Object.keys(answers)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
