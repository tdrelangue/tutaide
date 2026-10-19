// Appointments: validation of the input, ownership of participants and places, and deletion that keeps history.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { appointmentSchema, createAppointment, deleteAppointment } from "../appointments";
import type { AppointmentInput } from "../appointments";
import { loadPlannerState } from "../bridge/load";
import { seal, sealPoint } from "../sealed";
import { AgendaRefusal } from "../service";
import { createTestDb } from "./db";
import { LILLE, NOW, addPerson, insertItem, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const TODAY_DATE = new Date("2026-10-19T00:00:00.000Z");
const GHOST_ID = "c".repeat(25);

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const valid = (over: Partial<Record<string, unknown>> = {}) => ({
  title: "Audience chez le juge",
  participantIds: [],
  place: { kind: "OFFICE" },
  durationMin: 60,
  when: { kind: "RANGE", from: "2026-10-19", to: "2026-10-23" },
  priority: "HIGH",
  ...over,
});

const input = (over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, priority: "HIGH",
  when: { kind: "RANGE", from: "2026-10-19", to: "2026-10-23" }, ...over,
});

describe("appointmentSchema", () => {
  it("accepts a fixed time, a week and a range", () => {
    assert.equal(appointmentSchema.safeParse(valid({ when: { kind: "FIXED", date: "2026-10-20", timeMin: 600 } })).success, true);
    assert.equal(appointmentSchema.safeParse(valid({ when: { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" } })).success, true);
    assert.equal(appointmentSchema.safeParse(valid()).success, true);
  });

  it("rejects a window whose end precedes its start", () => {
    const result = appointmentSchema.safeParse(valid({ when: { kind: "RANGE", from: "2026-10-23", to: "2026-10-19" } }));
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0]?.path, ["when"]);
  });

  it("rejects a window longer than a year but accepts exactly 366 days and a single day", () => {
    const range = (to: string) => valid({ when: { kind: "RANGE", from: "2026-01-01", to } });
    assert.equal(appointmentSchema.safeParse(range("2027-01-03")).success, false);
    assert.equal(appointmentSchema.safeParse(range("2027-01-02")).success, true);
    assert.equal(appointmentSchema.safeParse(valid({ when: { kind: "RANGE", from: "2026-10-19", to: "2026-10-19" } })).success, true);
  });

  it("rejects malformed dates, out-of-range times and unknown kinds", () => {
    for (const when of [
      { kind: "RANGE", from: "19/10/2026", to: "2026-10-23" },
      { kind: "FIXED", date: "2026-10-19", timeMin: 1440 },
      { kind: "FIXED", date: "2026-10-19", timeMin: -1 },
      { kind: "FIXED", date: "2026-02-31", timeMin: 600 },
      { kind: "SOMEDAY" },
    ]) {
      assert.equal(appointmentSchema.safeParse(valid({ when })).success, false, JSON.stringify(when));
    }
  });

  it("reports an impossible calendar date as a validation error instead of throwing", () => {
    const result = appointmentSchema.safeParse(valid({ when: { kind: "RANGE", from: "2026-13-45", to: "2026-14-01" } }));
    assert.equal(result.success, false);
    assert.equal(appointmentSchema.safeParse(valid({ when: { kind: "WEEK", from: "2026-02-30", to: "2026-03-05" } })).success, false);
  });

  it("rejects a title that is too short, a duration out of bounds, and an unknown priority", () => {
    assert.equal(appointmentSchema.safeParse(valid({ title: " a " })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ durationMin: 4 })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ durationMin: 601 })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ priority: "URGENT" })).success, false);
  });

  it("rejects ids that are not plain ids, more than 20 participants, and a place choice without place", () => {
    assert.equal(appointmentSchema.safeParse(valid({ participantIds: ["x' OR 1=1 --"] })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ participantIds: Array.from({ length: 21 }, () => GHOST_ID) })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ place: { kind: "PLACE" } })).success, false);
    assert.equal(appointmentSchema.safeParse(valid({ place: { kind: "VISIO" } })).success, true);
  });
});

describe("createAppointment", () => {
  it("stores a fixed-time appointment with its date and time, deduplicating participants", async () => {
    const owner = await seedOwner(client, "appt-fixed@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const id = await createAppointment(owner, owner, input({ participantIds: [jean, jean], when: { kind: "FIXED", date: "2026-10-20", timeMin: 600 } }));
    const row = await client.agendaAppointment.findUniqueOrThrow({ where: { id }, include: { participants: true } });
    assert.equal(row.whenKind, "FIXED");
    assert.equal(row.date?.toISOString().slice(0, 10), "2026-10-20");
    assert.equal(row.timeMin, 600);
    assert.equal(row.fromDate, null);
    assert.equal(row.createdById, owner);
    assert.deepEqual(row.participants.map((p) => p.contactId), [jean]);
  });

  it("stores a window appointment with its bounds and no fixed time", async () => {
    const owner = await seedOwner(client, "appt-range@test.invalid");
    const id = await createAppointment(owner, owner, input({ place: { kind: "VISIO" } }));
    const row = await client.agendaAppointment.findUniqueOrThrow({ where: { id } });
    assert.equal(row.whenKind, "RANGE");
    assert.equal(row.fromDate?.toISOString().slice(0, 10), "2026-10-19");
    assert.equal(row.toDate?.toISOString().slice(0, 10), "2026-10-23");
    assert.equal(row.date, null);
    assert.equal(row.timeMin, null);
    assert.equal(row.placeKind, "VISIO");
  });

  it("accepts one of the owner's free places", async () => {
    const owner = await seedOwner(client, "appt-place@test.invalid");
    const place = await client.agendaPlace.create({
      data: { ownerId: owner, label: "Tribunal", address: seal(LILLE.label), point: sealPoint(LILLE), precision: "housenumber" },
    });
    const id = await createAppointment(owner, owner, input({ place: { kind: "PLACE", placeId: place.id } }));
    assert.equal((await client.agendaAppointment.findUniqueOrThrow({ where: { id } })).placeId, place.id);
  });

  it("refuses another owner's participant with an AgendaRefusal and stores nothing", async () => {
    const mine = await seedOwner(client, "appt-mine@test.invalid");
    const theirs = await seedOwner(client, "appt-theirs@test.invalid");
    const theirPerson = await addPerson(client, theirs, "Paul Ochon");
    await assert.rejects(createAppointment(mine, mine, input({ participantIds: [theirPerson] })), AgendaRefusal);
    await assert.rejects(createAppointment(mine, mine, input({ participantIds: [GHOST_ID] })), AgendaRefusal);
    assert.equal(await client.agendaAppointment.count({ where: { ownerId: mine } }), 0);
  });

  it("refuses another owner's place", async () => {
    const mine = await seedOwner(client, "appt-place-mine@test.invalid");
    const theirs = await seedOwner(client, "appt-place-theirs@test.invalid");
    const theirPlace = await client.agendaPlace.create({
      data: { ownerId: theirs, label: "Tribunal", address: seal(LILLE.label), point: sealPoint(LILLE) },
    });
    await assert.rejects(createAppointment(mine, mine, input({ place: { kind: "PLACE", placeId: theirPlace.id } })), AgendaRefusal);
  });
});

describe("deleteAppointment", () => {
  async function appointmentWithItems(email: string) {
    const owner = await seedOwner(client, email);
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const appointmentId = await createAppointment(owner, owner, input({ participantIds: [jean] }));
    const item = (itemKey: string, date: string) =>
      insertItem(client, owner, { itemKey, contactId: jean, title: "Audience", date, start: 600, kind: "APPT", appointmentId });
    return { owner, jean, appointmentId, item };
  }

  it("cancels the validated items still to come and keeps the past ones as history without the appointment", async () => {
    // Arrange
    const { owner, appointmentId, item } = await appointmentWithItems("del-appt@test.invalid");
    const past = await item("past-key", "2026-10-12");
    const today = await item("today-key", "2026-10-19");
    const future = await item("future-key", "2026-10-21");
    // Act
    const deleted = await deleteAppointment(owner, appointmentId, TODAY_DATE);
    // Assert
    assert.equal(deleted, true);
    assert.equal(await client.agendaAppointment.count({ where: { id: appointmentId } }), 0);
    const rows = await client.agendaItem.findMany({ where: { ownerId: owner }, orderBy: { date: "asc" } });
    assert.deepEqual(rows.map((r) => [r.id, r.status, r.appointmentId]), [
      [past.id, "VALIDATED", null],
      [today.id, "VALIDATED", null],
      [future.id, "CANCELLED", null],
    ]);
    assert.equal(rows[2]?.itemKey, `CANCELLED:${future.id}`);
    assert.notEqual(rows[2]?.statusAt, null);
  });

  it("leaves the cancelled item out of the planner's state and the past ones in", async () => {
    const { owner, appointmentId, item } = await appointmentWithItems("del-appt-load@test.invalid");
    await item("past-key", "2026-10-12");
    await item("future-key", "2026-10-21");
    await deleteAppointment(owner, appointmentId, TODAY_DATE);
    const loaded = await loadPlannerState(owner, NOW);
    assert.ok(loaded.ok);
    const dates = loaded.ok ? loaded.state.validated.map((v) => v.date) : [];
    assert.deepEqual(dates, ["2026-10-12"]);
  });

  it("returns false and touches nothing for an unknown appointment or another owner's", async () => {
    const mine = await appointmentWithItems("del-mine@test.invalid");
    const theirs = await appointmentWithItems("del-theirs@test.invalid");
    const theirItem = await theirs.item("future-key", "2026-10-21");
    assert.equal(await deleteAppointment(mine.owner, theirs.appointmentId, TODAY_DATE), false);
    assert.equal(await deleteAppointment(mine.owner, GHOST_ID, TODAY_DATE), false);
    assert.equal(await client.agendaAppointment.count({ where: { id: theirs.appointmentId } }), 1);
    const row = await client.agendaItem.findUniqueOrThrow({ where: { id: theirItem.id } });
    assert.equal(row.status, "VALIDATED");
    assert.equal(row.appointmentId, theirs.appointmentId);
  });

  it("deletes an appointment that has no item at all", async () => {
    const { owner, appointmentId } = await appointmentWithItems("del-empty@test.invalid");
    assert.equal(await deleteAppointment(owner, appointmentId, TODAY_DATE), true);
  });
});
