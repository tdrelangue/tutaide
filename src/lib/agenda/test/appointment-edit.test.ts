// Thomas, 2026-11-03: a fixed date and time is already agreed (validated at once); an appointment can be changed, its planning follows.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AppointmentInput } from "../appointments";
import { appointmentForEdit } from "../appointments";
import { addAppointment, type AddOutcome } from "../bridge/ops/insert";
import { editAppointment } from "../bridge/ops/edit";
import { proposePeriod } from "../bridge/ops/plan";
import { createTestDb } from "./db";
import { WEEK, addPerson, depsWith, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const appointment = (when: AppointmentInput["when"], over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  title: "Signature chez le notaire", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, when, priority: "NORMAL", ...over,
});
const monday9 = { kind: "FIXED", date: "2026-10-20", timeMin: 540 } as const;

function idOf(outcome: AddOutcome): string {
  if (outcome.kind === "NOT_PLANNABLE") throw new Error("expected a plannable agenda");
  return outcome.appointmentId;
}

async function items(ownerId: string, appointmentId: string) {
  return client.agendaItem.findMany({ where: { ownerId, appointmentId }, include: { participants: true }, orderBy: { createdAt: "asc" } });
}

describe("a fixed date and time is validated when it is entered", () => {
  it("goes straight into the validated planning, and counts as the person's next visit", async () => {
    const owner = await seedOwner(client, "edit-fixed@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const outcome = await addAppointment(owner, owner, appointment(monday9, { participantIds: [jean] }), deps);
    assert.equal(outcome.kind, "VALIDATED");
    const [item] = await items(owner, outcome.appointmentId);
    assert.ok(item);
    assert.deepEqual([item.status, item.fixed, item.date.toISOString().slice(0, 10), item.startMin, item.endMin], ["VALIDATED", true, "2026-10-20", 540, 600]);
    assert.deepEqual(item.participants.map((p) => p.contactId), [jean]);
    const proposed = await proposePeriod(owner, WEEK, deps);
    assert.ok(proposed.ok);
    const visitsToJean = proposed.proposal.plan.days.flatMap((d) => d.items).filter((i) => i.task.kind === "VISIT" && i.task.participants.includes(jean));
    assert.equal(visitsToJean.length, 0, "the appointment stands for the visit: not suggested again");
  });

  it("a window (« dans la semaine du… ») is still placed by the proposal", async () => {
    const owner = await seedOwner(client, "edit-window@test.invalid");
    const outcome = await addAppointment(owner, owner, appointment({ kind: "WEEK", from: "2026-11-02", to: "2026-11-06" }), deps);
    assert.equal(outcome.kind, "LISTED");
    assert.equal((await items(owner, outcome.appointmentId)).length, 0);
  });
});

describe("Modifier le rendez-vous", () => {
  it("reads back what the form needs", async () => {
    const owner = await seedOwner(client, "edit-read@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const appointmentId = idOf(await addAppointment(owner, owner, appointment(monday9, { participantIds: [jean], place: { kind: "PERSON", personId: jean } }), deps));
    const input = await appointmentForEdit(owner, appointmentId);
    assert.deepEqual(input, { ...appointment(monday9, { participantIds: [jean], place: { kind: "PERSON", personId: jean } }), partnerIds: [] });
    assert.equal(await appointmentForEdit(await seedOwner(client, "edit-read-other@test.invalid"), appointmentId), null);
  });

  it("a shorter meeting this time: the validated item keeps its time with the new length", async () => {
    const owner = await seedOwner(client, "edit-shorter@test.invalid");
    const appointmentId = idOf(await addAppointment(owner, owner, appointment(monday9), deps));
    const outcome = await editAppointment(owner, appointmentId, appointment(monday9, { durationMin: 15, title: "Juste une signature" }), deps);
    assert.deepEqual([outcome.kept, outcome.cancelled], [1, 0]);
    const [item] = await items(owner, appointmentId);
    assert.deepEqual([item?.title, item?.startMin, item?.endMin, item?.status], ["Juste une signature", 540, 555, "VALIDATED"]);
  });

  it("another fixed time moves the validated item there; a window that leaves its day out cancels it to be placed again", async () => {
    const owner = await seedOwner(client, "edit-move@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const appointmentId = idOf(await addAppointment(owner, owner, appointment(monday9), deps));
    await editAppointment(owner, appointmentId, appointment({ kind: "FIXED", date: "2026-10-22", timeMin: 840 }, { participantIds: [jean] }), deps);
    const moved = (await items(owner, appointmentId))[0];
    assert.deepEqual([moved?.date.toISOString().slice(0, 10), moved?.startMin, moved?.participants.map((p) => p.contactId)], ["2026-10-22", 840, [jean]]);
    const outcome = await editAppointment(owner, appointmentId, appointment({ kind: "RANGE", from: "2026-11-02", to: "2026-11-13" }), deps);
    assert.deepEqual([outcome.kept, outcome.cancelled], [0, 1]);
    assert.deepEqual((await items(owner, appointmentId)).map((i) => i.status), ["CANCELLED"]);
  });

  it("refuses another owner's appointment and changes nothing", async () => {
    const owner = await seedOwner(client, "edit-guard@test.invalid");
    const appointmentId = idOf(await addAppointment(owner, owner, appointment(monday9), deps));
    const other = await seedOwner(client, "edit-guard-other@test.invalid");
    await assert.rejects(editAppointment(other, appointmentId, appointment(monday9, { durationMin: 15 }), deps));
    assert.equal((await items(owner, appointmentId))[0]?.endMin, 600);
  });
});
