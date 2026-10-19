// proposePeriod / validatePeriod: a plan is only stored when the user validates exactly what they saw.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { toValidatedItems } from "@/lib/agenda-engine/domain";
import type { Plan } from "@/lib/agenda-engine/domain";
import { createAppointment } from "../appointments";
import { AgendaConflict, AgendaUserError } from "../bridge/errors";
import { planFingerprint } from "../bridge/fingerprint";
import { loadPlannerState } from "../bridge/load";
import { pinBlock } from "../bridge/ops/adjust";
import { proposePeriod, validatePeriod } from "../bridge/ops/plan";
import type { ProposeResult } from "../bridge/ops/plan";
import { createTestDb, createUser } from "./db";
import {
  NOW, TOURCOING, WEEK, addPerson, depsWith, failingFetch, insertItem, recordingFetch, seedOwner,
} from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

type Proposed = Extract<ProposeResult, { ok: true }>;

async function proposeOk(ownerId: string, period = WEEK, withDeps = deps): Promise<Proposed> {
  const result = await proposePeriod(ownerId, period, withDeps);
  if (!result.ok) throw new Error("expected a plannable agenda");
  return result;
}

/** An owner with two overdue monthly visits. */
async function twoVisits(email: string) {
  const owner = await seedOwner(client, email);
  const jean = await addPerson(client, owner, "Jean Bonneau");
  const aude = await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
  return { owner, jean, aude };
}

const storedCount = (ownerId: string) => client.agendaItem.count({ where: { ownerId } });

describe("proposePeriod", () => {
  it("refuses to plan without a home address and says why", async () => {
    const owner = await createUser(client, "plan-nohome@test.invalid");
    const result = await proposePeriod(owner, WEEK, deps);
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.reason, "NOT_PLANNABLE");
    assert.equal(result.ok ? null : result.issues[0]?.reason, "NO_HOME");
  });

  it("answers INVALID_INPUT for an impossible, reversed or longer than 31 days period, and plans 31 days", async () => {
    const { owner } = await twoVisits("plan-invalid@test.invalid");
    for (const period of [
      { from: "2026-02-31", to: "2026-03-05" },
      { from: "2026-10-23", to: "2026-10-19" },
      { from: "2026-10-19", to: "2026-11-19" },
      { from: "nope", to: "2026-10-19" },
    ]) {
      const result = await proposePeriod(owner, period, deps);
      assert.equal(result.ok ? null : result.reason, "INVALID_INPUT", JSON.stringify(period));
    }
    const month = await proposePeriod(owner, { from: "2026-10-19", to: "2026-11-18" }, deps);
    assert.equal(month.ok, true);
  });

  it("proposes the overdue visits without storing anything", async () => {
    const { owner } = await twoVisits("plan-propose@test.invalid");
    const proposed = await proposeOk(owner);
    assert.equal(toValidatedItems(proposed.proposal.plan).length, 2);
    assert.equal(proposed.today, "2026-10-19");
    assert.match(proposed.fingerprint, /^[0-9a-f]{32}$/);
    assert.equal(await storedCount(owner), 0);
  });

  it("never plans in the past: a period starting before today starts today", async () => {
    const { owner } = await twoVisits("plan-clip@test.invalid");
    const proposed = await proposeOk(owner, { from: "2026-10-05", to: "2026-10-23" });
    assert.equal(proposed.proposal.plan.from, "2026-10-19");
  });

  it("gives the same fingerprint twice for an unchanged agenda", async () => {
    const { owner } = await twoVisits("plan-stable@test.invalid");
    const first = await proposeOk(owner);
    const second = await proposeOk(owner);
    assert.equal(first.fingerprint, second.fingerprint);
  });

  it("calls IGN through the injected fetch only, and lists no estimate when it answers", async () => {
    const { owner } = await twoVisits("plan-ign@test.invalid");
    const urls: string[] = [];
    const proposed = await proposeOk(owner, WEEK, depsWith(recordingFetch(urls)));
    assert.ok(urls.length > 0);
    assert.ok(urls.every((u) => u.startsWith("https://data.geopf.fr/")));
    assert.deepEqual(proposed.estimated, []);
  });

  it("still plans, with road times reported as estimated, when IGN is unreachable", async () => {
    const { owner } = await twoVisits("plan-offline@test.invalid");
    const proposed = await proposeOk(owner, WEEK, depsWith(failingFetch));
    assert.equal(toValidatedItems(proposed.proposal.plan).length, 2);
    assert.equal(proposed.estimated.length > 0, true);
  });
});

describe("validatePeriod", () => {
  it("writes exactly the proposed items, which load back with the same ids, dates and starts", async () => {
    // Arrange
    const { owner, jean, aude } = await twoVisits("plan-validate@test.invalid");
    const proposed = await proposeOk(owner);
    // Row order is not part of the contract: compare by start time within the day.
    const byStart = (a: readonly (string | number)[], b: readonly (string | number)[]) => Number(a[2]) - Number(b[2]);
    const expected = toValidatedItems(proposed.proposal.plan).map((v) => [v.id, v.date, v.start, v.end]).sort(byStart);
    // Act
    const added = await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
    // Assert
    const loaded = await loadPlannerState(owner, NOW);
    assert.equal(added, 2);
    assert.ok(loaded.ok);
    const saved = loaded.ok ? loaded.state.validated.map((v) => [v.id, v.date, v.start, v.end]).sort(byStart) : [];
    assert.deepEqual(saved, expected);
    const people = await client.agendaItemParticipant.findMany({ where: { item: { ownerId: owner } } });
    assert.deepEqual(people.map((p) => p.contactId).sort(), [jean, aude].sort());
  });

  it("stores addresses and coordinates encrypted, like the rest of the agenda", async () => {
    const { owner } = await twoVisits("plan-sealed@test.invalid");
    const proposed = await proposeOk(owner);
    await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
    const rows = await client.agendaItem.findMany({ where: { ownerId: owner } });
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.placeAddress.includes("Roubaix") || row.placeAddress.includes("Tourcoing"), false);
      assert.equal(row.placePoint?.includes("50.6"), false);
      assert.equal(row.status, "VALIDATED");
    }
  });

  it("adds nothing when the same plan is validated twice", async () => {
    const { owner } = await twoVisits("plan-twice@test.invalid");
    const proposed = await proposeOk(owner);
    await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
    const again = await proposeOk(owner);
    const addedAgain = await validatePeriod(owner, WEEK, again.fingerprint, deps);
    assert.equal(addedAgain, 0);
    assert.equal(await storedCount(owner), 2);
  });

  it("does not propose again the visits that are already validated", async () => {
    const { owner } = await twoVisits("plan-noredo@test.invalid");
    const proposed = await proposeOk(owner);
    await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
    const nextWeek = await proposeOk(owner, { from: "2026-10-26", to: "2026-10-30" });
    assert.deepEqual(toValidatedItems(nextWeek.proposal.plan), []);
    assert.deepEqual(nextWeek.proposal.plan.unplaced, []);
  });

  it("refuses a stale fingerprint with an AgendaConflict and writes nothing", async () => {
    // Arrange: the user saw a plan, then an assistant blocks Monday.
    const { owner } = await twoVisits("plan-stale@test.invalid");
    const proposed = await proposeOk(owner);
    await client.agendaRule.create({ data: { ownerId: owner, type: "UNAVAILABLE", label: "Lundi", strength: "HARD", dow: 1, allDay: true } });
    // Act + Assert
    await assert.rejects(validatePeriod(owner, WEEK, proposed.fingerprint, deps), AgendaConflict);
    assert.equal(await storedCount(owner), 0);
  });

  it("refuses a made-up fingerprint", async () => {
    const { owner } = await twoVisits("plan-forged@test.invalid");
    await assert.rejects(validatePeriod(owner, WEEK, "0".repeat(32), deps), AgendaConflict);
    assert.equal(await storedCount(owner), 0);
  });

  it("refuses to validate an invalid period with a user-safe error, before computing anything", async () => {
    const { owner } = await twoVisits("plan-validate-invalid@test.invalid");
    await assert.rejects(validatePeriod(owner, { from: "2026-10-23", to: "2026-10-19" }, "x", deps), AgendaUserError);
    await assert.rejects(validatePeriod(owner, { from: "2026-10-19", to: "2026-12-31" }, "x", deps), AgendaUserError);
  });

  it("refuses to validate an agenda that cannot be planned", async () => {
    const owner = await createUser(client, "plan-validate-nohome@test.invalid");
    await assert.rejects(validatePeriod(owner, WEEK, "x", deps), AgendaConflict);
  });

  it("turns a concurrent validation (unique key already taken) into an AgendaConflict and rolls everything back", async () => {
    // Arrange: a row hidden from the loader (neither VALIDATED nor MISSED) holds one occurrence's key.
    const { owner, jean } = await twoVisits("plan-race@test.invalid");
    const proposed = await proposeOk(owner);
    const key = toValidatedItems(proposed.proposal.plan).find((v) => v.personId === jean)?.id;
    assert.ok(key);
    await insertItem(client, owner, { itemKey: key, contactId: jean, title: "Visite", date: "2026-10-01", start: 600, status: "CANCELLED" });
    // Act + Assert
    await assert.rejects(validatePeriod(owner, WEEK, proposed.fingerprint, deps), AgendaConflict);
    assert.equal(await storedCount(owner), 1, "only the pre-existing row: the other visit was rolled back");
  });

  it("keeps the other owners' agenda untouched", async () => {
    const mine = await twoVisits("plan-mine@test.invalid");
    const theirs = await twoVisits("plan-theirs@test.invalid");
    const proposed = await proposeOk(mine.owner);
    await validatePeriod(mine.owner, WEEK, proposed.fingerprint, deps);
    assert.equal(await storedCount(theirs.owner), 0);
  });

  it("keeps a dragged block where the user dropped it and deletes its pin once validated", async () => {
    // Arrange: Jean's visit dragged to Thursday 14:00 before validation.
    const { owner, jean } = await twoVisits("plan-pin@test.invalid");
    const key = `${jean}@2026-10-01`;
    assert.deepEqual(await pinBlock(owner, key, { date: "2026-10-22", start: 840 }, NOW), { ok: true });
    assert.equal(await client.agendaPin.count({ where: { ownerId: owner } }), 1);
    const proposed = await proposeOk(owner);
    // Act
    await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
    // Assert
    const row = await client.agendaItem.findFirstOrThrow({ where: { ownerId: owner, itemKey: key } });
    assert.equal(row.date.toISOString().slice(0, 10), "2026-10-22");
    assert.equal(row.startMin, 840);
    assert.equal(await client.agendaPin.count({ where: { ownerId: owner } }), 0);
  });
});

describe("planFingerprint", () => {
  const emptyPlan: Plan = {
    from: WEEK.from, to: WEEK.to, days: [], late: [], unplaced: [], bent: [], postponed: [], softMissed: [], alerts: [], pinWarnings: [], totalKm: 0,
  };

  it("is a fixed-size hex digest, even for an empty plan", () => {
    assert.match(planFingerprint(emptyPlan), /^[0-9a-f]{32}$/);
  });

  async function ownerWithAppointment(email: string) {
    const owner = await seedOwner(client, email);
    const appointmentId = await createAppointment(owner, owner, {
      title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60,
      when: { kind: "WEEK", from: WEEK.from, to: WEEK.to }, priority: "HIGH",
    });
    return { owner, appointmentId };
  }

  it("changes when the title of an appointment is edited between preview and validation", async () => {
    const { owner, appointmentId } = await ownerWithAppointment("plan-fp-title@test.invalid");
    const before = await proposeOk(owner);
    await client.agendaAppointment.update({ where: { id: appointmentId }, data: { title: "Audience chez le notaire" } });
    const after = await proposeOk(owner);
    assert.notEqual(before.fingerprint, after.fingerprint);
    await assert.rejects(validatePeriod(owner, WEEK, before.fingerprint, deps), AgendaConflict);
  });

  it("changes when the priority of an appointment is edited", async () => {
    const { owner, appointmentId } = await ownerWithAppointment("plan-fp-prio@test.invalid");
    const before = await proposeOk(owner);
    await client.agendaAppointment.update({ where: { id: appointmentId }, data: { priority: "LOW" } });
    assert.notEqual(before.fingerprint, (await proposeOk(owner)).fingerprint);
  });

  it("changes when a visit moves to another day or time", async () => {
    const { owner, jean } = await twoVisits("plan-fp@test.invalid");
    const before = await proposeOk(owner);
    await pinBlock(owner, `${jean}@2026-10-01`, { date: "2026-10-23", start: 900 }, NOW);
    const after = await proposeOk(owner);
    assert.notEqual(before.fingerprint, after.fingerprint);
  });
});
