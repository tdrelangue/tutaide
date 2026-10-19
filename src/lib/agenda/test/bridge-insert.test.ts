// Rule 12: adding an appointment to a plan that is already validated. Nothing moves without the user's say-so.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AgendaRefusal } from "../service";
import type { AppointmentInput } from "../appointments";
import { AgendaConflict, AgendaUserError } from "../bridge/errors";
import { addAppointment, applyMoves, insertionFingerprint, placeInFreeSlot, previewMoves } from "../bridge/ops/insert";
import type { AddOutcome } from "../bridge/ops/insert";
import { proposePeriod, validatePeriod } from "../bridge/ops/plan";
import { createTestDb, createUser } from "./db";
import { NOW, WEEK, TOURCOING, addPerson, depsWith, insertItem, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const appointment = (when: AppointmentInput["when"], over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, when, priority: "HIGH", ...over,
});
const thisWeek: AppointmentInput["when"] = { kind: "WEEK", from: WEEK.from, to: WEEK.to };

/** An owner whose week is validated: Jean and Aude are both visited on Monday 19 (08:50 and 10:10). */
async function validatedWeek(email: string) {
  const owner = await seedOwner(client, email);
  const jean = await addPerson(client, owner, "Jean Bonneau");
  const aude = await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
  const proposed = await proposePeriod(owner, WEEK, deps);
  if (!proposed.ok) throw new Error("expected a plannable agenda");
  await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
  return { owner, jean, aude };
}

/** Every stored row of the owner, as plain JSON, to prove nothing else was touched. */
async function snapshot(ownerId: string): Promise<string> {
  const rows = await client.agendaItem.findMany({ where: { ownerId }, orderBy: { id: "asc" }, include: { participants: true } });
  return JSON.stringify(rows);
}

function needsInsert(outcome: AddOutcome) {
  if (outcome.kind !== "NEEDS_INSERT") throw new Error(`expected NEEDS_INSERT, got ${outcome.kind}`);
  return outcome;
}

describe("addAppointment", () => {
  it("lists an appointment whose dates do not touch the validated plan, and leaves the plan alone", async () => {
    // Arrange
    const { owner, jean } = await validatedWeek("ins-listed@test.invalid");
    const before = await snapshot(owner);
    // Act
    const outcome = await addAppointment(owner, owner, appointment({ kind: "WEEK", from: "2026-11-02", to: "2026-11-06" }, { participantIds: [jean] }), deps);
    // Assert
    assert.equal(outcome.kind, "LISTED");
    assert.equal(await snapshot(owner), before);
    const stored = await client.agendaAppointment.findUniqueOrThrow({ where: { id: outcome.appointmentId }, include: { participants: true } });
    assert.deepEqual(stored.participants.map((p) => p.contactId), [jean]);
  });

  it("answers NOT_PLANNABLE (with why) when the agenda cannot be planned yet, and creates nothing", async () => {
    const owner = await createUser(client, "ins-nohome@test.invalid");
    const outcome = await addAppointment(owner, owner, appointment(thisWeek), deps);
    assert.deepEqual(outcome, { kind: "NOT_PLANNABLE", issues: [{ kind: "settings", id: "none", reason: "NO_HOME" }] });
    assert.equal(await client.agendaAppointment.count({ where: { ownerId: owner } }), 0);
  });

  it("validates the input itself: a title too short or an impossible window is refused before anything is read or written", async () => {
    const owner = await seedOwner(client, "ins-invalid@test.invalid");
    await assert.rejects(addAppointment(owner, owner, appointment(thisWeek, { title: "x" }), deps));
    await assert.rejects(addAppointment(owner, owner, appointment({ kind: "WEEK", from: "2026-02-31", to: "2026-03-01" }), deps));
    assert.equal(await client.agendaAppointment.count({ where: { ownerId: owner } }), 0);
  });

  it("offers free slots for an appointment touching the validated plan, none of them on a validated visit", async () => {
    const { owner } = await validatedWeek("ins-touch@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(thisWeek), deps));
    assert.deepEqual(outcome.conflicts, []);
    assert.ok(outcome.options.length >= 1 && outcome.options.length <= 4);
    for (const option of outcome.options) {
      assert.ok(option.date >= WEEK.from && option.date <= WEEK.to);
      const overlapsVisits = option.date === "2026-10-19" && option.start < 670 && option.end > 530;
      assert.equal(overlapsVisits, false, "a free slot never overlaps a validated visit");
    }
  });

  it("reports the validated visits that overlap a fixed-time appointment", async () => {
    const { owner, jean } = await validatedWeek("ins-fixed@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment({ kind: "FIXED", date: "2026-10-19", timeMin: 540 }, { durationMin: 120 }), deps));
    assert.equal(outcome.conflicts.length, 2);
    assert.ok(outcome.conflicts.some((c) => c.personId === jean));
  });

  it("refuses a participant who is not the owner's, before writing anything", async () => {
    const mine = await validatedWeek("ins-mine@test.invalid");
    const theirs = await validatedWeek("ins-theirs@test.invalid");
    const before = await client.agendaAppointment.count({ where: { ownerId: mine.owner } });
    await assert.rejects(addAppointment(mine.owner, mine.owner, appointment(thisWeek, { participantIds: [theirs.jean] }), deps), AgendaRefusal);
    assert.equal(await client.agendaAppointment.count({ where: { ownerId: mine.owner } }), before);
  });
});

describe("placeInFreeSlot", () => {
  it("writes the appointment in the chosen free slot without touching any other row", async () => {
    // Arrange
    const { owner, jean } = await validatedWeek("ins-place@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(thisWeek, { participantIds: [jean] }), deps));
    const slot = outcome.options[0];
    assert.ok(slot);
    const before = await snapshot(owner);
    // Act
    await placeInFreeSlot(owner, outcome.appointmentId, { date: slot.date, start: slot.start }, deps);
    // Assert
    const rows = await client.agendaItem.findMany({ where: { ownerId: owner }, orderBy: { id: "asc" }, include: { participants: true } });
    const added = rows.find((r) => r.appointmentId === outcome.appointmentId);
    assert.ok(added);
    assert.equal(added.itemKey, outcome.appointmentId);
    assert.equal(added.date.toISOString().slice(0, 10), slot.date);
    assert.equal(added.startMin, slot.start);
    assert.equal(added.endMin, slot.end);
    assert.equal(added.kind, "APPT");
    assert.equal(added.fixed, false);
    assert.equal(added.placeAddress.includes("Lille"), false, "address is sealed");
    assert.deepEqual(added.participants.map((p) => p.contactId), [jean]);
    assert.equal(JSON.stringify(rows.filter((r) => r !== added)), before, "every other row is byte-identical");
  });

  it("refuses to place the same appointment twice", async () => {
    const { owner } = await validatedWeek("ins-twice@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(thisWeek), deps));
    const slot = outcome.options[0];
    assert.ok(slot);
    await placeInFreeSlot(owner, outcome.appointmentId, slot, deps);
    await assert.rejects(placeInFreeSlot(owner, outcome.appointmentId, slot, deps), AgendaConflict);
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner, appointmentId: outcome.appointmentId } }), 1);
  });

  it("refuses a slot that was not offered, and writes nothing", async () => {
    const { owner } = await validatedWeek("ins-badslot@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(thisWeek), deps));
    const before = await snapshot(owner);
    await assert.rejects(placeInFreeSlot(owner, outcome.appointmentId, { date: "2026-10-19", start: 540 }, deps), AgendaConflict);
    assert.equal(await snapshot(owner), before);
  });

  it("refuses an unknown appointment, another owner's appointment and an agenda without home", async () => {
    const mine = await validatedWeek("ins-unk-mine@test.invalid");
    const theirs = await validatedWeek("ins-unk-theirs@test.invalid");
    const theirOutcome = needsInsert(await addAppointment(theirs.owner, theirs.owner, appointment(thisWeek), deps));
    const slot = { date: "2026-10-20", start: 510 };
    await assert.rejects(placeInFreeSlot(mine.owner, "unknown", slot, deps), AgendaConflict);
    await assert.rejects(placeInFreeSlot(mine.owner, theirOutcome.appointmentId, slot, deps), AgendaConflict);
    const nobody = await createUser(client, "ins-unk-nohome@test.invalid");
    await assert.rejects(placeInFreeSlot(nobody, "x", slot, deps), AgendaConflict);
    assert.equal(await client.agendaItem.count({ where: { appointmentId: theirOutcome.appointmentId } }), 0);
  });
});

describe("previewMoves / applyMoves", () => {
  async function fixedOverVisits(email: string) {
    const week = await validatedWeek(email);
    const when: AppointmentInput["when"] = { kind: "FIXED", date: "2026-10-19", timeMin: 540 };
    const outcome = needsInsert(await addAppointment(week.owner, week.owner, appointment(when, { durationMin: 120 }), deps));
    return { ...week, appointmentId: outcome.appointmentId, movable: outcome.conflicts.map((c) => c.id) };
  }

  it("applies exactly the moves previewed: the new item is added, the moved visits are marked moved", async () => {
    // Arrange
    const { owner, appointmentId, movable } = await fixedOverVisits("ins-apply@test.invalid");
    const { result, fingerprint } = await previewMoves(owner, appointmentId, movable, deps);
    assert.deepEqual(result.placement && [result.placement.date, result.placement.start], ["2026-10-19", 540]);
    assert.equal(result.changes.length, 2);
    // Act
    await applyMoves(owner, appointmentId, movable, { fingerprint, confirmRemovals: false }, deps);
    // Assert
    const rows = await client.agendaItem.findMany({ where: { ownerId: owner } });
    const added = rows.find((r) => r.itemKey === appointmentId);
    assert.ok(added);
    assert.equal(added.fixed, true);
    assert.equal(added.startMin, 540);
    for (const change of result.changes) {
      const row = rows.find((r) => r.itemKey === change.item.id);
      assert.ok(row && change.to);
      assert.equal(row.moved, true);
      assert.equal(row.date.toISOString().slice(0, 10), change.to.date);
      assert.equal(row.startMin, change.to.start);
      assert.equal(row.endMin, change.to.end);
      assert.equal(row.status, "VALIDATED");
    }
  });

  it("refuses a wrong fingerprint with an AgendaConflict and writes nothing", async () => {
    const { owner, appointmentId, movable } = await fixedOverVisits("ins-wrongfp@test.invalid");
    const before = await snapshot(owner);
    await assert.rejects(applyMoves(owner, appointmentId, movable, { fingerprint: "0".repeat(32), confirmRemovals: true }, deps), AgendaConflict);
    assert.equal(await snapshot(owner), before);
  });

  it("refuses a preview that no longer matches once the user allows other moves", async () => {
    const { owner, appointmentId, movable } = await fixedOverVisits("ins-otherset@test.invalid");
    const { fingerprint } = await previewMoves(owner, appointmentId, movable, deps);
    const before = await snapshot(owner);
    await assert.rejects(applyMoves(owner, appointmentId, movable.slice(0, 1), { fingerprint, confirmRemovals: false }, deps), AgendaConflict);
    assert.equal(await snapshot(owner), before);
  });

  it("refuses more than 100 movable ids, and counts a repeated id once", async () => {
    const { owner } = await validatedWeek("ins-movable@test.invalid");
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(thisWeek), deps));
    const many = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await assert.rejects(previewMoves(owner, outcome.appointmentId, many, deps), AgendaUserError);
    const repeated = Array.from({ length: 150 }, () => "same-id");
    const once = await previewMoves(owner, outcome.appointmentId, ["same-id"], deps);
    const again = await previewMoves(owner, outcome.appointmentId, repeated, deps);
    assert.equal(again.fingerprint, once.fingerprint);
  });

  it("applies once when two sessions confirm the same preview at the same time", async () => {
    const { owner, appointmentId, movable } = await fixedOverVisits("ins-race@test.invalid");
    const { fingerprint } = await previewMoves(owner, appointmentId, movable, deps);
    const confirm = { fingerprint, confirmRemovals: false };
    const settled = await Promise.allSettled([
      applyMoves(owner, appointmentId, movable, confirm, deps),
      applyMoves(owner, appointmentId, movable, confirm, deps),
    ]);
    assert.equal(settled.filter((s) => s.status === "fulfilled").length, 1);
    const failed = settled.find((s) => s.status === "rejected");
    assert.ok(failed && failed.status === "rejected" && failed.reason instanceof AgendaConflict);
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner, appointmentId } }), 1);
  });

  it("finds no slot at all for an appointment longer than any working day", async () => {
    const { owner } = await validatedWeek("ins-noslot@test.invalid");
    const when: AppointmentInput["when"] = { kind: "FIXED", date: "2026-10-19", timeMin: 510 };
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(when, { durationMin: 600 }), deps));
    const { result, fingerprint } = await previewMoves(owner, outcome.appointmentId, [], deps);
    assert.equal(result.placement, null);
    await assert.rejects(applyMoves(owner, outcome.appointmentId, [], { fingerprint, confirmRemovals: true }, deps), AgendaConflict);
  });
});

describe("removals", () => {
  /** Paul can only be visited on Monday 10:00-11:00 and is booked then: a fixed appointment over it leaves him nowhere to go. */
  async function paulWithNowhereToGo(email: string) {
    const owner = await seedOwner(client, email);
    const paul = await addPerson(client, owner, "Paul Ochon");
    await client.agendaAvailability.create({ data: { contactId: paul, dows: [1], fromMin: 600, toMin: 660 } });
    const visit = await insertItem(client, owner, { itemKey: `${paul}@2026-10-01`, contactId: paul, title: "Visite à Paul Ochon", date: "2026-10-19", start: 600 });
    const when: AppointmentInput["when"] = { kind: "FIXED", date: "2026-10-19", timeMin: 540 };
    const outcome = needsInsert(await addAppointment(owner, owner, appointment(when, { durationMin: 120 }), deps));
    return { owner, visit, appointmentId: outcome.appointmentId, movable: outcome.conflicts.map((c) => c.id) };
  }

  it("refuses to drop a visit from the planning without confirmRemovals, and writes nothing", async () => {
    // Arrange
    const { owner, appointmentId, movable } = await paulWithNowhereToGo("ins-remove-no@test.invalid");
    const { result, fingerprint } = await previewMoves(owner, appointmentId, movable, deps);
    assert.deepEqual(result.changes.map((c) => c.to), [null]);
    const before = await snapshot(owner);
    // Act + Assert
    await assert.rejects(applyMoves(owner, appointmentId, movable, { fingerprint, confirmRemovals: false }, deps), AgendaConflict);
    assert.equal(await snapshot(owner), before);
  });

  it("cancels the visit, keeps it as history and places the appointment once the user confirms", async () => {
    const { owner, visit, appointmentId, movable } = await paulWithNowhereToGo("ins-remove-yes@test.invalid");
    const { fingerprint } = await previewMoves(owner, appointmentId, movable, deps);
    await applyMoves(owner, appointmentId, movable, { fingerprint, confirmRemovals: true }, deps);
    const cancelled = await client.agendaItem.findUniqueOrThrow({ where: { id: visit.id } });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.statusAt?.getTime(), NOW.getTime(), "stamped with the injected clock");
    assert.equal(cancelled.itemKey, `CANCELLED:${visit.itemKey}@2026-10-19@${NOW.getTime()}`);
    const placed = await client.agendaItem.findFirstOrThrow({ where: { ownerId: owner, itemKey: appointmentId } });
    assert.equal(placed.status, "VALIDATED");
    assert.equal(placed.startMin, 540);
  });
});

describe("insertionFingerprint", () => {
  const slot = { date: "2026-10-19", start: 540, end: 660 };

  it("is stable for the same insertion and changes with the placement", () => {
    const a = insertionFingerprint({ placement: slot, changes: [], bent: [] });
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(a, insertionFingerprint({ placement: { ...slot }, changes: [], bent: [] }));
    assert.notEqual(a, insertionFingerprint({ placement: { ...slot, start: 600 }, changes: [], bent: [] }));
    assert.notEqual(a, insertionFingerprint({ placement: null, changes: [], bent: [] }));
  });
});
