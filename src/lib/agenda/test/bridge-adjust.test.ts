// pinBlock / unpinBlock / setRuleAnswer / setOccurrence: choices stored before validation, always scoped to the owner.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { toValidatedItems } from "@/lib/agenda-engine/domain";
import { loadPlannerState } from "../bridge/load";
import { pinBlock, setOccurrence, setRuleAnswer, unpinBlock } from "../bridge/ops/adjust";
import { proposePeriod } from "../bridge/ops/plan";
import { createTestDb, createUser } from "./db";
import { NOW, WEEK, TOURCOING, addPerson, depsWith, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));
const INVALID = { ok: false, reason: "INVALID_INPUT" };
const UNKNOWN = { ok: false, reason: "UNKNOWN_ITEM" };
const DONE = { ok: true };

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

async function proposedItems(ownerId: string) {
  const result = await proposePeriod(ownerId, WEEK, deps);
  if (!result.ok) throw new Error("expected a plannable agenda");
  return toValidatedItems(result.proposal.plan);
}

async function stateOf(ownerId: string) {
  const loaded = await loadPlannerState(ownerId, NOW);
  if (!loaded.ok) throw new Error("expected a plannable agenda");
  return loaded.state;
}

async function ownerWithJean(email: string) {
  const owner = await seedOwner(client, email);
  const jean = await addPerson(client, owner, "Jean Bonneau");
  return { owner, jean, key: `${jean}@2026-10-01` };
}

describe("pinBlock / unpinBlock", () => {
  it("stores an encrypted pin and the next proposal keeps the visit at that slot", async () => {
    // Arrange
    const { owner, key } = await ownerWithJean("adjust-pin@test.invalid");
    // Act
    const outcome = await pinBlock(owner, key, { date: "2026-10-22", start: 840 }, NOW);
    // Assert
    assert.deepEqual(outcome, DONE);
    const row = await client.agendaPin.findFirstOrThrow({ where: { ownerId: owner } });
    assert.equal(row.itemKey, key);
    assert.equal(row.placeAddress.includes("Roubaix"), false);
    assert.equal(row.placePoint?.includes("50.69"), false);
    const items = await proposedItems(owner);
    assert.deepEqual(items.map((v) => [v.id, v.date, v.start]), [[key, "2026-10-22", 840]]);
  });

  it("moves an existing pin instead of adding a second one", async () => {
    const { owner, key } = await ownerWithJean("adjust-repin@test.invalid");
    await pinBlock(owner, key, { date: "2026-10-22", start: 840 }, NOW);
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-23", start: 600 }, NOW), DONE);
    const pins = await client.agendaPin.findMany({ where: { ownerId: owner } });
    assert.equal(pins.length, 1);
    assert.equal(pins[0]?.date.toISOString().slice(0, 10), "2026-10-23");
    assert.equal(pins[0]?.startMin, 600);
  });

  it("accepts the last day of the 92-day horizon and refuses the day after (a pin never extends the horizon)", async () => {
    const { owner, key } = await ownerWithJean("adjust-far@test.invalid");
    assert.deepEqual(await pinBlock(owner, key, { date: "2027-01-19", start: 600 }, NOW), DONE);
    assert.deepEqual(await pinBlock(owner, key, { date: "2027-01-20", start: 600 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, key, { date: "2027-03-02", start: 600 }, NOW), INVALID);
  });

  it("refuses malformed input before reading anything: bad date, bad start, oversized key", async () => {
    const { owner, key } = await ownerWithJean("adjust-invalid@test.invalid");
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-02-31", start: 600 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, key, { date: "not a date", start: 600 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-22", start: 1436 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-22", start: -1 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-22", start: 600.5 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, "k".repeat(121), { date: "2026-10-22", start: 600 }, NOW), INVALID);
    assert.equal(await client.agendaPin.count({ where: { ownerId: owner } }), 0);
  });

  it("refuses a slot in the past, an unknown block and a block it cannot plan", async () => {
    const { owner, key, jean } = await ownerWithJean("adjust-refuse@test.invalid");
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-12", start: 600 }, NOW), INVALID);
    assert.deepEqual(await pinBlock(owner, "unknown@2026-10-01", { date: "2026-10-22", start: 600 }, NOW), UNKNOWN);
    assert.deepEqual(await pinBlock(owner, `${jean}@2025-01-01`, { date: "2026-10-22", start: 600 }, NOW), UNKNOWN);
    assert.equal(await client.agendaPin.count({ where: { ownerId: owner } }), 0);
  });

  it("answers NOT_PLANNABLE without a home address", async () => {
    const owner = await createUser(client, "adjust-nohome@test.invalid");
    assert.deepEqual(await pinBlock(owner, "x", { date: "2026-10-22", start: 600 }, NOW), { ok: false, reason: "NOT_PLANNABLE", issues: [{ kind: "settings", id: "none", reason: "NO_HOME" }] });
  });

  it("cannot pin, nor unpin, another owner's block", async () => {
    const mine = await ownerWithJean("adjust-pin-mine@test.invalid");
    const theirs = await ownerWithJean("adjust-pin-theirs@test.invalid");
    assert.deepEqual(await pinBlock(theirs.owner, mine.key, { date: "2026-10-22", start: 600 }, NOW), UNKNOWN);
    await pinBlock(mine.owner, mine.key, { date: "2026-10-22", start: 600 }, NOW);
    assert.deepEqual(await unpinBlock(theirs.owner, mine.key), UNKNOWN);
    assert.equal(await client.agendaPin.count({ where: { ownerId: mine.owner } }), 1);
  });

  it("unpin gives the block back to the planner, once", async () => {
    const { owner, key } = await ownerWithJean("adjust-unpin@test.invalid");
    const planned = await proposedItems(owner);
    await pinBlock(owner, key, { date: "2026-10-23", start: 900 }, NOW);
    assert.deepEqual(await unpinBlock(owner, key), DONE);
    assert.deepEqual(await unpinBlock(owner, key), UNKNOWN);
    assert.deepEqual(await proposedItems(owner), planned);
  });
});

describe("setRuleAnswer", () => {
  async function ruleOf(ownerId: string) {
    return client.agendaRule.create({ data: { ownerId, type: "UNAVAILABLE", label: "Mercredi", strength: "STRONG", dow: 3, allDay: true } });
  }

  it("stores the answer, reads it back in the state, and clears it with null", async () => {
    const { owner } = await ownerWithJean("answer-rule@test.invalid");
    const rule = await ruleOf(owner);
    assert.deepEqual(await setRuleAnswer(owner, rule.id, { answer: "break" }), DONE);
    assert.equal((await stateOf(owner)).answers[rule.id], "break");
    assert.deepEqual(await setRuleAnswer(owner, rule.id, { answer: "respect" }), DONE);
    assert.equal((await stateOf(owner)).answers[rule.id], "respect");
    assert.deepEqual(await setRuleAnswer(owner, rule.id, { answer: null }), DONE);
    assert.equal((await stateOf(owner)).answers[rule.id], undefined);
    assert.equal(await client.agendaRuleAnswer.count({ where: { ownerId: owner } }), 1);
  });

  it("records a refused exception without touching the answer", async () => {
    const { owner } = await ownerWithJean("answer-refused@test.invalid");
    const rule = await ruleOf(owner);
    await setRuleAnswer(owner, rule.id, { answer: "break" });
    await setRuleAnswer(owner, rule.id, { refused: true });
    const state = await stateOf(owner);
    assert.deepEqual(state.refusedExceptions, [rule.id]);
    assert.equal(state.answers[rule.id], "break");
  });

  it("accepts the preferred-day key of one's own contact", async () => {
    const { owner, jean } = await ownerWithJean("answer-pref@test.invalid");
    assert.deepEqual(await setRuleAnswer(owner, `pref:${jean}`, { answer: "respect" }), DONE);
  });

  it("refuses a rule key of another owner and writes nothing", async () => {
    const mine = await ownerWithJean("answer-mine@test.invalid");
    const theirs = await ownerWithJean("answer-theirs@test.invalid");
    const theirRule = await ruleOf(theirs.owner);
    assert.deepEqual(await setRuleAnswer(mine.owner, theirRule.id, { answer: "break" }), UNKNOWN);
    assert.deepEqual(await setRuleAnswer(mine.owner, `pref:${theirs.jean}`, { answer: "break" }), UNKNOWN);
    assert.deepEqual(await setRuleAnswer(mine.owner, "not-a-rule", { refused: true }), UNKNOWN);
    assert.equal(await client.agendaRuleAnswer.count({ where: { ownerId: { in: [mine.owner, theirs.owner] } } }), 0);
  });
});

describe("setOccurrence", () => {
  it("skips an occurrence: the next proposal no longer contains the visit, and un-skipping restores it", async () => {
    // Arrange
    const { owner, key } = await ownerWithJean("occ-skip@test.invalid");
    assert.equal((await proposedItems(owner)).length, 1);
    // Act + Assert
    assert.deepEqual(await setOccurrence(owner, key, { skipped: true }, NOW), DONE);
    assert.deepEqual(await proposedItems(owner), []);
    assert.deepEqual(await setOccurrence(owner, key, { skipped: false }, NOW), DONE);
    assert.equal((await proposedItems(owner)).length, 1);
    assert.equal(await client.agendaOccurrenceOverride.count({ where: { ownerId: owner } }), 1);
  });

  it("gives one occurrence its own priority, and null goes back to the person's", async () => {
    const { owner, key } = await ownerWithJean("occ-prio@test.invalid");
    await setOccurrence(owner, key, { priority: "MUST" }, NOW);
    assert.equal((await proposedItems(owner))[0]?.priority, "MUST");
    await setOccurrence(owner, key, { priority: null }, NOW);
    assert.equal((await proposedItems(owner))[0]?.priority, "NORMAL");
  });

  it("refuses a malformed key", async () => {
    const { owner, jean } = await ownerWithJean("occ-bad@test.invalid");
    for (const bad of ["", "nope", jean, `${jean}@2026-1-1`, `${jean}@2026-10-01;DROP`, `short@2026-10-01`]) {
      assert.deepEqual(await setOccurrence(owner, bad, { skipped: true }, NOW), UNKNOWN, bad);
    }
    assert.equal(await client.agendaOccurrenceOverride.count({ where: { ownerId: owner } }), 0);
  });

  it("refuses another owner's contact", async () => {
    const mine = await ownerWithJean("occ-mine@test.invalid");
    const theirs = await ownerWithJean("occ-theirs@test.invalid");
    assert.deepEqual(await setOccurrence(mine.owner, theirs.key, { skipped: true }, NOW), UNKNOWN);
    assert.equal(await client.agendaOccurrenceOverride.count({ where: { ownerId: { in: [mine.owner, theirs.owner] } } }), 0);
  });

  it("refuses a contact who is not a protected person", async () => {
    const { owner } = await ownerWithJean("occ-family@test.invalid");
    const aude = await client.agendaContact.create({ data: { ownerId: owner, category: "FAMILLE", fullName: "Aude Javel" } });
    assert.deepEqual(await setOccurrence(owner, `${aude.id}@2026-10-01`, { skipped: true }, NOW), UNKNOWN);
  });

  it("answers UNKNOWN_ITEM for an impossible calendar date, never a RangeError", async () => {
    const { owner, jean } = await ownerWithJean("occ-date@test.invalid");
    assert.deepEqual(await setOccurrence(owner, `${jean}@2026-13-45`, { skipped: true }, NOW), UNKNOWN);
    assert.deepEqual(await setOccurrence(owner, `${jean}@2026-02-31`, { skipped: true }, NOW), UNKNOWN);
  });

  it("refuses a due date more than a year from today and a malformed change", async () => {
    const { owner, jean } = await ownerWithJean("occ-range@test.invalid");
    assert.deepEqual(await setOccurrence(owner, `${jean}@2028-01-01`, { skipped: true }, NOW), INVALID);
    assert.deepEqual(await setOccurrence(owner, `${jean}@2024-01-01`, { skipped: true }, NOW), INVALID);
    assert.deepEqual(await setOccurrence(owner, `${jean}@2026-10-01`, { priority: "URGENT" as never }, NOW), INVALID);
    assert.deepEqual(await setOccurrence(owner, `${jean}@2026-10-01`, { skipped: "yes" as never }, NOW), INVALID);
    assert.equal(await client.agendaOccurrenceOverride.count({ where: { ownerId: owner } }), 0);
  });

  it("keeps each person's occurrences apart", async () => {
    const { owner, key } = await ownerWithJean("occ-two@test.invalid");
    const aude = await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
    await setOccurrence(owner, key, { skipped: true }, NOW);
    const items = await proposedItems(owner);
    assert.deepEqual(items.map((v) => v.personId), [aude]);
  });
});
