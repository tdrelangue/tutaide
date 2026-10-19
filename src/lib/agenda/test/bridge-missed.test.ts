// « N'a pas eu lieu »: a past validated item turns MISSED, its key is freed and the work is due again.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { toValidatedItems } from "@/lib/agenda-engine/domain";
import { createAppointment } from "../appointments";
import { CONFIRM_WINDOW_DAYS, itemsToConfirm, markItemMissed } from "../bridge/ops/missed";
import { proposePeriod } from "../bridge/ops/plan";
import { createTestDb, createUser } from "./db";
import { NOW, WEEK, addPerson, depsWith, insertItem, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

async function proposedItems(ownerId: string, period = WEEK) {
  const result = await proposePeriod(ownerId, period, deps);
  if (!result.ok) throw new Error("expected a plannable agenda");
  return toValidatedItems(result.proposal.plan);
}

/** A visit held on 2026-10-14 (so not due again until mid-November), with a LOW rhythm priority. */
async function seenLastWeek(email: string) {
  const owner = await seedOwner(client, email);
  const jean = await addPerson(client, owner, "Jean Bonneau");
  await client.agendaContact.update({ where: { id: jean }, data: { visitPriority: "LOW" } });
  const row = await insertItem(client, owner, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-14", start: 600 });
  return { owner, jean, row };
}

describe("markItemMissed on a visit", () => {
  it("turns the row MISSED, rewrites its key and makes the visit due again at Normale priority at least", async () => {
    // Arrange
    const { owner, jean, row } = await seenLastWeek("missed-visit@test.invalid");
    assert.deepEqual(await proposedItems(owner), [], "seen last week: nothing due yet");
    // Act
    const outcome = await markItemMissed(owner, `${jean}@2026-10-01`, NOW);
    // Assert
    assert.deepEqual(outcome, { ok: true, requeued: false });
    const stored = await client.agendaItem.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.status, "MISSED");
    assert.equal(stored.itemKey, `MISSED:${row.id}`);
    assert.notEqual(stored.statusAt, null);
    const again = await proposedItems(owner);
    assert.equal(again.length, 1);
    assert.equal(again[0]?.id, `${jean}@2026-10-01`, "the same occurrence can be planned again");
    assert.notEqual(again[0]?.priority, "LOW");
  });

  it("lets the same occurrence be validated again after it was missed", async () => {
    const { owner, jean } = await seenLastWeek("missed-revalidate@test.invalid");
    await markItemMissed(owner, `${jean}@2026-10-01`, NOW);
    const again = await insertItem(client, owner, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-21", start: 600 });
    assert.equal(again.status, "VALIDATED");
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner } }), 2);
  });

  it("refuses a visit still to come with FUTURE and writes nothing", async () => {
    const owner = await seedOwner(client, "missed-future@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const row = await insertItem(client, owner, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite", date: "2026-10-21", start: 600 });
    const outcome = await markItemMissed(owner, `${jean}@2026-10-01`, NOW);
    assert.deepEqual(outcome, { ok: false, reason: "FUTURE" });
    const stored = await client.agendaItem.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.status, "VALIDATED");
    assert.equal(stored.itemKey, `${jean}@2026-10-01`);
  });

  it("refuses an unknown key, an already missed item and another owner's item", async () => {
    const { owner, jean } = await seenLastWeek("missed-unknown@test.invalid");
    const stranger = await seedOwner(client, "missed-stranger@test.invalid");
    assert.deepEqual(await markItemMissed(owner, "nope", NOW), { ok: false, reason: "UNKNOWN_ITEM" });
    assert.deepEqual(await markItemMissed(stranger, `${jean}@2026-10-01`, NOW), { ok: false, reason: "UNKNOWN_ITEM" });
    await markItemMissed(owner, `${jean}@2026-10-01`, NOW);
    assert.deepEqual(await markItemMissed(owner, `${jean}@2026-10-01`, NOW), { ok: false, reason: "UNKNOWN_ITEM" });
  });

  it("answers NOT_PLANNABLE when the agenda has no home", async () => {
    const owner = await createUser(client, "missed-nohome@test.invalid");
    assert.deepEqual(await markItemMissed(owner, "x", NOW), { ok: false, reason: "NOT_PLANNABLE", issues: [{ kind: "settings", id: "none", reason: "NO_HOME" }] });
  });

  it("refuses a window that is not real dates, reversed, in the past or longer than a month, and writes nothing", async () => {
    const { owner, jean, row } = await seenLastWeek("missed-window@test.invalid");
    const key = `${jean}@2026-10-01`;
    const invalid = { ok: false, reason: "INVALID_INPUT" };
    assert.deepEqual(await markItemMissed(owner, key, NOW, { from: "2026-02-31", to: "2026-11-06" }), invalid);
    assert.deepEqual(await markItemMissed(owner, key, NOW, { from: "2026-11-06", to: "2026-11-02" }), invalid);
    assert.deepEqual(await markItemMissed(owner, key, NOW, { from: "2026-10-18", to: "2026-10-30" }), invalid);
    assert.deepEqual(await markItemMissed(owner, key, NOW, { from: "2026-11-02", to: "2026-12-03" }), invalid);
    assert.equal((await client.agendaItem.findUniqueOrThrow({ where: { id: row.id } })).status, "VALIDATED");
    assert.deepEqual(await markItemMissed(owner, key, NOW, { from: "2026-11-02", to: "2026-12-02" }), { ok: true, requeued: false });
  });

  it("marks the item once when two sessions confirm at the same time, never twice", async () => {
    const { owner, jean, row } = await seenLastWeek("missed-race@test.invalid");
    const settled = await Promise.allSettled([markItemMissed(owner, `${jean}@2026-10-01`, NOW), markItemMissed(owner, `${jean}@2026-10-01`, NOW)]);
    const succeeded = settled.filter((s) => s.status === "fulfilled" && s.value.ok);
    assert.equal(succeeded.length, 1);
    const stored = await client.agendaItem.findMany({ where: { ownerId: owner } });
    assert.deepEqual(stored.map((r) => [r.id, r.status]), [[row.id, "MISSED"]]);
  });
});

describe("markItemMissed on an appointment", () => {
  async function heldAppointment(email: string) {
    const owner = await seedOwner(client, email);
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const apptId = await createAppointment(owner, owner, {
      title: "Signature chez le notaire", participantIds: [jean], place: { kind: "OFFICE" }, durationMin: 60,
      when: { kind: "FIXED", date: "2026-10-14", timeMin: 600 }, priority: "HIGH",
    });
    const row = await insertItem(client, owner, { itemKey: apptId, contactId: jean, title: "Signature chez le notaire", date: "2026-10-14", start: 600, kind: "APPT", appointmentId: apptId });
    return { owner, apptId, row };
  }

  it("reopens it as a RANGE over next week (Monday to Friday) and bumps its version", async () => {
    // Arrange
    const { owner, apptId, row } = await heldAppointment("missed-appt@test.invalid");
    // Act
    const outcome = await markItemMissed(owner, apptId, NOW);
    // Assert
    assert.deepEqual(outcome, { ok: true, requeued: true });
    const appt = await client.agendaAppointment.findUniqueOrThrow({ where: { id: apptId } });
    assert.equal(appt.whenKind, "RANGE");
    assert.equal(appt.fromDate?.toISOString().slice(0, 10), "2026-10-26");
    assert.equal(appt.toDate?.toISOString().slice(0, 10), "2026-10-30");
    assert.equal(appt.date, null);
    assert.equal(appt.timeMin, null);
    assert.equal(appt.version, 1);
    assert.equal((await client.agendaItem.findUniqueOrThrow({ where: { id: row.id } })).status, "MISSED");
  });

  it("is placed again by the next proposal, inside the new window", async () => {
    const { owner, apptId } = await heldAppointment("missed-appt-replan@test.invalid");
    await markItemMissed(owner, apptId, NOW);
    const items = await proposedItems(owner, { from: "2026-10-26", to: "2026-10-30" });
    const replanned = items.find((v) => v.id === apptId);
    assert.ok(replanned);
    assert.ok(replanned.date >= "2026-10-26" && replanned.date <= "2026-10-30");
  });

  it("honours a window chosen by the user", async () => {
    const { owner, apptId } = await heldAppointment("missed-appt-window@test.invalid");
    await markItemMissed(owner, apptId, NOW, { from: "2026-11-02", to: "2026-11-06" });
    const appt = await client.agendaAppointment.findUniqueOrThrow({ where: { id: apptId } });
    assert.equal(appt.fromDate?.toISOString().slice(0, 10), "2026-11-02");
    assert.equal(appt.toDate?.toISOString().slice(0, 10), "2026-11-06");
  });
});

describe("itemsToConfirm", () => {
  it("lists the validated items of the last days up to today, not older nor future ones", async () => {
    const owner = await seedOwner(client, "confirm@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const keep = [["2026-10-12", 540], ["2026-10-19", 540]] as const;
    const skip = [["2026-10-11", 540], ["2026-10-20", 540]] as const;
    for (const [date, start] of [...keep, ...skip]) {
      await insertItem(client, owner, { itemKey: `${jean}@${date}`, contactId: jean, title: date, date, start });
    }
    const outcome = await itemsToConfirm(owner, NOW);
    assert.equal(CONFIRM_WINDOW_DAYS, 7);
    assert.ok(outcome.ok);
    assert.deepEqual(outcome.ok ? outcome.items.map((i) => i.date).sort() : [], ["2026-10-12", "2026-10-19"]);
  });

  it("says NOT_PLANNABLE (with why) for an agenda that cannot be planned yet, and lists nothing for another owner", async () => {
    const owner = await createUser(client, "confirm-nohome@test.invalid");
    assert.deepEqual(await itemsToConfirm(owner, NOW), { ok: false, reason: "NOT_PLANNABLE", issues: [{ kind: "settings", id: "none", reason: "NO_HOME" }] });
    const other = await seedOwner(client, "confirm-other@test.invalid");
    assert.deepEqual(await itemsToConfirm(other, NOW), { ok: true, items: [] });
  });
});
