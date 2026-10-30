// « Mes indisponibilités » and holidays, against a real (in-memory) PostgreSQL, read back by the planner.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { dayRuleSchema, deleteDayRule, listDayRules, saveDayRule } from "../day-rules";
import { mapRules } from "../bridge/map/rules";
import { createTestDb, createUser } from "./db";

let client: PrismaClient;
let close: () => Promise<void>;
let alice: string;
let bob: string;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
  alice = await createUser(client, "alice-rules@test.invalid");
  bob = await createUser(client, "bob-rules@test.invalid");
});
afterAll(() => close());

const wednesday = { type: "UNAVAILABLE" as const, label: "Mercredi après-midi : enfants", strength: "STRONG" as const, dow: 3, allDay: false, fromMin: 840, toMin: 1080, atOffice: false };
const friday = { type: "UNAVAILABLE" as const, label: "Journée au bureau", strength: "HARD" as const, dow: 5, allDay: true, fromMin: null, toMin: null, atOffice: true };
const summer = { type: "VACATION" as const, label: "Vacances d'été", from: "2026-08-03", to: "2026-08-21" };

describe("day rules (in order: each test builds on the previous state)", () => {
  it("validation refuses inverted hours, inverted dates and an empty name", () => {
    assert.equal(dayRuleSchema.safeParse({ ...wednesday, fromMin: 1080, toMin: 840 }).success, false);
    assert.equal(dayRuleSchema.safeParse({ ...summer, from: "2026-08-21", to: "2026-08-03" }).success, false);
    assert.equal(dayRuleSchema.safeParse({ ...friday, label: "  " }).success, false);
    assert.equal(dayRuleSchema.safeParse({ ...summer, to: "2027-09-01" }).success, false, "holidays last less than a year");
    assert.equal(dayRuleSchema.safeParse(friday).success, true);
  });

  it("saves, lists sorted (weekly by day, then holidays) and keeps hours only when not all day", async () => {
    await saveDayRule(alice, null, summer);
    await saveDayRule(alice, null, friday);
    await saveDayRule(alice, null, { ...wednesday });
    const list = await listDayRules(alice);
    assert.deepEqual(list.map((r) => r.label), ["Mercredi après-midi : enfants", "Journée au bureau", "Vacances d'été"]);
    const fri = list[1];
    assert.ok(fri.type === "UNAVAILABLE");
    assert.equal(fri.fromMin, null);
    assert.equal(fri.atOffice, true);
  });

  it("the planner reads them: Friday closed, Wednesday asked, summer off", async () => {
    const mapped = mapRules(await client.agendaRule.findMany({ where: { ownerId: alice } }));
    assert.equal(mapped.issues.length, 0, "no rule is rejected by the mapper");
    const types = mapped.values.map((r) => `${r.type}:${r.strength}`).sort();
    assert.deepEqual(types, ["UNAVAILABLE:HARD", "UNAVAILABLE:STRONG", "VACATION:HARD"]);
  });

  it("edits in place, and another MJPM can neither edit nor delete it", async () => {
    const [wed] = await listDayRules(alice);
    assert.equal(await saveDayRule(bob, wed.id, { ...wednesday, strength: "SOFT" }), false);
    assert.equal(await deleteDayRule(bob, wed.id), false);
    assert.equal(await saveDayRule(alice, wed.id, { ...wednesday, strength: "MEDIUM", label: "Mercredi" }), true);
    const after = (await listDayRules(alice)).find((r) => r.id === wed.id);
    assert.ok(after?.type === "UNAVAILABLE");
    assert.equal(after.strength, "MEDIUM");
    assert.equal(after.label, "Mercredi");
    assert.deepEqual(await listDayRules(bob), []);
  });

  it("deleting a rule also forgets the answer given to its question", async () => {
    const [wed] = await listDayRules(alice);
    await client.agendaRuleAnswer.create({ data: { ownerId: alice, ruleKey: wed.id, answer: "BREAK" } });
    assert.equal(await deleteDayRule(alice, wed.id), true);
    assert.equal(await client.agendaRuleAnswer.count({ where: { ownerId: alice } }), 0);
    assert.equal((await listDayRules(alice)).length, 2);
  });
});
