// Notes and checklist of a rendez-vous: where they live, encryption, ownership, and kept when the appointment is deleted.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAppointment, deleteAppointment } from "../appointments";
import type { AppointmentInput } from "../appointments";
import { AgendaUserError } from "../bridge/errors";
import { addTask, deleteTask, getNotes, saveNotes, setTaskDone } from "../notes";
import { createTestDb } from "./db";
import { addPerson, insertItem, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const TODAY_DATE = new Date("2026-10-19T00:00:00.000Z");

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const input = (over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  title: "Signature chez le notaire", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, priority: "HIGH",
  when: { kind: "FIXED", date: "2026-10-12", timeMin: 600 }, ...over,
});

describe("notes and tasks", () => {
  it("are stored encrypted on the appointment and read back in order", async () => {
    const owner = await seedOwner(client, "notes-appt@test.invalid");
    const appointmentId = await createAppointment(owner, owner, input());
    await saveNotes(owner, appointmentId, "Apporter le compromis");
    await addTask(owner, appointmentId, "Pièce d'identité");
    await addTask(owner, appointmentId, "Relevé de compte");
    const view = await getNotes(owner, appointmentId);
    assert.equal(view.notes, "Apporter le compromis");
    assert.deepEqual(view.tasks.map((t) => [t.label, t.done]), [["Pièce d'identité", false], ["Relevé de compte", false]]);
    const stored = await client.agendaAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    assert.ok(stored.notes && !stored.notes.includes("compromis"));
    const task = await client.agendaTask.findFirstOrThrow({ where: { appointmentId } });
    assert.ok(!task.label.includes("identité"));
  });

  it("a validated item of an appointment shows the appointment's notes", async () => {
    const owner = await seedOwner(client, "notes-item-appt@test.invalid");
    const appointmentId = await createAppointment(owner, owner, input());
    await saveNotes(owner, appointmentId, "Préparer le dossier");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: "appt-key", contactId: jean, title: "Signature", date: "2026-10-12", start: 600, kind: "APPT", appointmentId });
    assert.equal((await getNotes(owner, "appt-key")).notes, "Préparer le dossier");
  });

  it("a visit keeps its own notes and tasks on the item", async () => {
    const owner = await seedOwner(client, "notes-visit@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const item = await insertItem(client, owner, { itemKey: `${jean}@2026-10-12`, contactId: jean, title: "Visite", date: "2026-10-12", start: 600 });
    await saveNotes(owner, `${jean}@2026-10-12`, "Frigo vide");
    await addTask(owner, `${jean}@2026-10-12`, "Appeler l'aide à domicile");
    const view = await getNotes(owner, `${jean}@2026-10-12`);
    assert.equal(view.notes, "Frigo vide");
    assert.equal((await client.agendaTask.findFirstOrThrow({ where: { itemId: item.id } })).appointmentId, null);
  });

  it("ticks, unticks and deletes a task; another MJPM cannot touch it", async () => {
    const owner = await seedOwner(client, "notes-tick@test.invalid");
    const other = await seedOwner(client, "notes-other@test.invalid");
    const appointmentId = await createAppointment(owner, owner, input());
    await addTask(owner, appointmentId, "Faire signer");
    const [task] = (await getNotes(owner, appointmentId)).tasks;
    assert.ok(task);
    await setTaskDone(owner, task.id, true);
    assert.equal((await getNotes(owner, appointmentId)).tasks[0]?.done, true);
    await assert.rejects(setTaskDone(other, task.id, false), AgendaUserError);
    await assert.rejects(getNotes(other, appointmentId), AgendaUserError);
    await deleteTask(owner, task.id);
    assert.equal((await getNotes(owner, appointmentId)).tasks.length, 0);
  });

  it("refuses an empty task and a proposed visit that has no row yet", async () => {
    const owner = await seedOwner(client, "notes-refuse@test.invalid");
    const appointmentId = await createAppointment(owner, owner, input());
    await assert.rejects(addTask(owner, appointmentId, "   "));
    await assert.rejects(getNotes(owner, `${"c".repeat(25)}@2026-10-20`), AgendaUserError);
  });

  it("move to the item that remains when the appointment is deleted", async () => {
    const owner = await seedOwner(client, "notes-delete@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const appointmentId = await createAppointment(owner, owner, input({ participantIds: [jean] }));
    const past = await insertItem(client, owner, { itemKey: "past-key", contactId: jean, title: "Signature", date: "2026-10-12", start: 600, kind: "APPT", appointmentId });
    await saveNotes(owner, appointmentId, "Signé, copie remise");
    await addTask(owner, appointmentId, "Envoyer la copie au juge");
    await deleteAppointment(owner, appointmentId, TODAY_DATE);
    const view = await getNotes(owner, "past-key");
    assert.equal(view.notes, "Signé, copie remise");
    assert.deepEqual(view.tasks.map((t) => t.label), ["Envoyer la copie au juge"]);
    const task = await client.agendaTask.findFirstOrThrow({ where: { ownerId: owner } });
    assert.deepEqual([task.itemId, task.appointmentId], [past.id, null]);
  });
});
