// The agenda service against a real (in-memory) PostgreSQL: composite keys,
// encryption at rest and erasure are checked by the database itself.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { encrypt } from "@/lib/encryption";
import * as service from "../service";
import { createTestDb, createUser } from "./db";

let client: PrismaClient;
let close: () => Promise<void>;
let alice: string;
let bob: string;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
  alice = await createUser(client, "alice@test.invalid");
  bob = await createUser(client, "bob@test.invalid");
});
afterAll(() => close());

describe("agenda service (tests run in order: each builds on the previous state)", () => {
  const lille = { label: "Place du Théâtre, 59000 Lille", lat: 50.6372, lon: 3.0633, precision: "housenumber" as const };
  const roubaix = { label: "Résidence Les Tilleuls, 59100 Roubaix", lat: 50.6907, lon: 3.1746, precision: "housenumber" as const };
  const person = {
    fullName: "Jean Bonneau",
    address: roubaix,
    visitsPerPeriod: 1,
    visitPeriod: "MONTH" as const,
    visitMinutes: null,
    notes: "Pas avant 10 h.",
    status: "ACTIVE" as const,
    endReason: null,
  };

  async function onlyPersonOf(ownerId: string) {
    const list = await service.listAgendaPersons(ownerId);
    assert.equal(list.length, 1);
    return list[0];
  }

  it("settings: defaults before anything is saved", async () => {
    const s = await service.getAgendaSettings(alice);
    assert.equal(s.home, null);
    assert.equal(s.dayEndLimitMinutes, 1140);
  });

  it("settings: saved, read back, and the home address is encrypted at rest", async () => {
    const input = { home: lille, office: null, workDays: [5, 1, 1], dayStartMinutes: 510, dayEndMinutes: 1080, dayEndLimitMinutes: 1140, defaultVisitMinutes: 45 };
    await service.saveAgendaSettings(alice, input);
    await service.saveAgendaSettings(alice, input);
    const s = await service.getAgendaSettings(alice);
    assert.deepEqual(s.home, lille);
    assert.deepEqual(s.workDays, [1, 5]);
    const row = await client.agendaSettings.findUniqueOrThrow({ where: { ownerId: alice } });
    assert.notEqual(row.homeAddress, lille.label);
    assert.equal(row.version, 1);
    assert.equal(row.homePoint?.includes(String(lille.lat)), false);
  });

  it("person: created with its default place; address and notes encrypted at rest", async () => {
    await service.createAgendaPerson(alice, alice, person);
    const view = await onlyPersonOf(alice);
    assert.deepEqual(view.address, roubaix);
    assert.equal(view.notes, person.notes);
    const contact = await client.agendaContact.findFirstOrThrow({ where: { ownerId: alice }, include: { places: true } });
    assert.equal(contact.category, "PROTEGE");
    assert.notEqual(contact.notes, person.notes);
    assert.notEqual(contact.places[0].address, roubaix.label);
    assert.equal(contact.places[0].point.includes(String(roubaix.lat)), false);
  });

  it("person: changing the address updates the same place; removing it deletes the place", async () => {
    const before = await client.agendaPlace.findFirstOrThrow({ where: { ownerId: alice } });
    const { id } = await onlyPersonOf(alice);
    assert.equal(await service.updateAgendaPerson(alice, id, { ...person, address: lille }), true);
    const after = await client.agendaPlace.findFirstOrThrow({ where: { ownerId: alice } });
    assert.equal(after.id, before.id);
    assert.deepEqual((await onlyPersonOf(alice)).address, lille);
    await service.updateAgendaPerson(alice, id, { ...person, address: null });
    assert.equal(await client.agendaPlace.count({ where: { ownerId: alice } }), 0);
  });

  it("person: an ended measure records its end date, and reopening clears it", async () => {
    const { id } = await onlyPersonOf(alice);
    await service.updateAgendaPerson(alice, id, { ...person, status: "ENDED", endReason: "DECES" });
    const ended = await client.agendaContact.findUniqueOrThrow({ where: { id } });
    assert.notEqual(ended.endedOn, null);
    await service.updateAgendaPerson(alice, id, person);
    const reopened = await client.agendaContact.findUniqueOrThrow({ where: { id } });
    assert.equal(reopened.endedOn, null);
    assert.equal(reopened.endReason, null);
  });

  it("isolation: another MJPM can neither see, change nor delete the person", async () => {
    const { id } = await onlyPersonOf(alice);
    assert.equal((await service.listAgendaPersons(bob)).length, 0);
    assert.equal(await service.updateAgendaPerson(bob, id, person), false);
    assert.equal(await service.deleteAgendaPerson(bob, id), false);
    assert.equal((await service.listAgendaPersons(alice)).length, 1);
  });

  it("isolation: the database refuses a place attached to another MJPM's contact", async () => {
    const { id } = await onlyPersonOf(alice);
    await assert.rejects(
      client.agendaPlace.create({ data: { ownerId: bob, contactId: id, label: "x", address: "x", point: "x" } })
    );
  });

  it("unreadable: a value that cannot be decrypted fails loudly instead of reading as empty", async () => {
    const { id } = await onlyPersonOf(alice);
    const row = await client.agendaContact.findUniqueOrThrow({ where: { id } });
    await client.agendaContact.update({ where: { id }, data: { notes: "00:11:22" } });
    await assert.rejects(service.listAgendaPersons(alice));
    await client.agendaContact.update({ where: { id }, data: { notes: row.notes } });
    assert.equal((await onlyPersonOf(alice)).notes, person.notes);
  });

  it("in use: an appointment at the person's home blocks deleting the person or clearing the address", async () => {
    const { id } = await onlyPersonOf(alice);
    await service.updateAgendaPerson(alice, id, person);
    const home = await client.agendaPlace.findFirstOrThrow({ where: { ownerId: alice, contactId: id } });
    const appt = await client.agendaAppointment.create({
      data: { ownerId: alice, title: "Réunion de famille", placeKind: "PLACE", placeId: home.id, durationMin: 60, whenKind: "WEEK", fromDate: new Date("2026-10-19T00:00:00.000Z") },
    });
    await assert.rejects(service.deleteAgendaPerson(alice, id), service.AgendaRefusal);
    await assert.rejects(service.updateAgendaPerson(alice, id, { ...person, address: null }), service.AgendaRefusal);
    await assert.rejects(client.agendaPlace.delete({ where: { id: home.id } }));
    assert.equal((await onlyPersonOf(alice)).address?.label, roubaix.label);
    await client.agendaAppointment.delete({ where: { id: appt.id } });
  });

  it("delete: where the person was only a participant, their name and home leave items and pins", async () => {
    const { id } = await onlyPersonOf(alice);
    const other = await client.agendaContact.create({ data: { ownerId: alice, category: "FAMILLE", fullName: "Aude Javel" } });
    const day = new Date("2026-10-21T00:00:00.000Z");
    const home = encrypt(roubaix.label);
    const item = await client.agendaItem.create({
      data: {
        ownerId: alice, itemKey: "appt-1", kind: "APPT", title: "Signature avec Jean Bonneau et Aude Javel",
        placeLabel: "Chez Jean", placeAddress: home, placePoint: encrypt("50.69,3.17"), date: day, startMin: 600,
        endMin: 660, priority: "HIGH", earliestDate: day, latestDate: day,
        participants: { create: [{ contactId: id }, { contactId: other.id }] },
      },
    });
    const pin = await client.agendaPin.create({
      data: {
        ownerId: alice, itemKey: "appt-2", kind: "APPT", title: "Point avec Jean Bonneau", participantIds: [id, other.id],
        placeLabel: "Tribunal", placeAddress: encrypt("1 rue du Palais, Lille"), durationMin: 60, priority: "NORMAL", date: day, startMin: 840,
      },
    });
    await service.deleteAgendaPerson(alice, id);
    const scrubbed = await client.agendaItem.findUniqueOrThrow({ where: { id: item.id }, include: { participants: true } });
    assert.equal(scrubbed.title, "Signature avec Contact supprimé et Aude Javel");
    assert.equal(scrubbed.placeAddress, "");
    assert.deepEqual(scrubbed.participants.map((p) => p.contactId), [other.id]);
    const keptPin = await client.agendaPin.findUniqueOrThrow({ where: { id: pin.id } });
    assert.equal(keptPin.title, "Point avec Contact supprimé");
    assert.deepEqual(keptPin.participantIds, [other.id]);
    assert.notEqual(keptPin.placeAddress, "");
    await client.agendaItem.delete({ where: { id: item.id } });
    await client.agendaPin.delete({ where: { id: pin.id } });
    await client.agendaContact.delete({ where: { id: other.id } });
    await service.createAgendaPerson(alice, alice, person);
  });

  it("half an address is an error, never read as « no address » (a save would erase the real one)", async () => {
    await service.saveAgendaSettings(alice, { home: lille, office: null, workDays: [1, 2, 3, 4, 5], dayStartMinutes: 510, dayEndMinutes: 1080, dayEndLimitMinutes: 1140, defaultVisitMinutes: 60 });
    const row = await client.agendaSettings.findUniqueOrThrow({ where: { ownerId: alice } });
    await client.agendaSettings.update({ where: { ownerId: alice }, data: { homePoint: null } });
    await assert.rejects(service.getAgendaSettings(alice), /Incomplete agenda address/);
    await client.agendaSettings.update({ where: { ownerId: alice }, data: { homePoint: row.homePoint, homeAddress: null } });
    await assert.rejects(service.getAgendaSettings(alice), /Incomplete agenda address/);
    await client.agendaSettings.update({ where: { ownerId: alice }, data: { homeAddress: row.homeAddress } });
    assert.deepEqual((await service.getAgendaSettings(alice)).home, lille);
  });

  it("delete: the name leaves titles whatever its case or regex characters, and appointment titles are scrubbed too", async () => {
    const odd = await client.agendaContact.create({ data: { ownerId: alice, category: "PROTEGE", fullName: "J. (Jean) Bonneau+" } });
    const other = await client.agendaContact.create({ data: { ownerId: alice, category: "FAMILLE", fullName: "Aude Javel" } });
    const day = new Date("2026-10-21T00:00:00.000Z");
    const item = await client.agendaItem.create({
      data: {
        ownerId: alice, itemKey: "appt-case", kind: "APPT", title: "RDV j. (JEAN) bonneau+ et j. (jean) bonneau+", placeLabel: "x", placeAddress: "", date: day,
        startMin: 600, endMin: 660, priority: "HIGH", earliestDate: day, latestDate: day, participants: { create: [{ contactId: odd.id }, { contactId: other.id }] },
      },
    });
    const mine = await client.agendaAppointment.create({
      data: {
        ownerId: alice, title: "Notaire pour J. (JEAN) BONNEAU+", placeKind: "OFFICE", durationMin: 60, whenKind: "WEEK", fromDate: day,
        participants: { create: [{ contactId: odd.id }] },
      },
    });
    const unrelated = await client.agendaAppointment.create({
      data: { ownerId: alice, title: "Notaire pour J. (JEAN) BONNEAU+", placeKind: "OFFICE", durationMin: 60, whenKind: "WEEK", fromDate: day },
    });
    await service.deleteAgendaPerson(alice, odd.id);
    assert.equal((await client.agendaItem.findUniqueOrThrow({ where: { id: item.id } })).title, "RDV Contact supprimé et Contact supprimé");
    assert.equal((await client.agendaAppointment.findUniqueOrThrow({ where: { id: mine.id } })).title, "Notaire pour Contact supprimé");
    assert.equal((await client.agendaAppointment.findUniqueOrThrow({ where: { id: unrelated.id } })).title, "Notaire pour J. (JEAN) BONNEAU+", "not a participant: untouched");
    await client.agendaItem.delete({ where: { id: item.id } });
    await client.agendaAppointment.deleteMany({ where: { id: { in: [mine.id, unrelated.id] } } });
    await client.agendaContact.delete({ where: { id: other.id } });
  });

  it("delete: the contact is erased from the validated planning first", async () => {
    const { id } = await onlyPersonOf(alice);
    const day = new Date("2026-10-20T00:00:00.000Z");
    const item = await client.agendaItem.create({
      data: {
        ownerId: alice, itemKey: `${id}@2026-10-20`, kind: "VISIT", contactId: id, title: "Visite Jean Bonneau",
        placeLabel: "Domicile", placeAddress: "", placePoint: null, date: day, startMin: 600,
        endMin: 660, priority: "NORMAL", earliestDate: day, latestDate: day,
      },
    });
    assert.equal(await service.deleteAgendaPerson(alice, id), true);
    const scrubbed = await client.agendaItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(scrubbed.contactId, null);
    assert.equal(scrubbed.title, "Contact supprimé");
    assert.equal(scrubbed.placeAddress, "");
    assert.equal(scrubbed.placePoint, null);
    assert.equal(await client.agendaContact.count({ where: { ownerId: alice } }), 0);
  });

  it("import: each dossier group once, with regular visits by default; never twice", async () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    await client.dossier.createMany({
      data: [
        { userId: bob, fullName: "Alain Térieur", groupId: "g1", moduleType: "APA", createdAt: created },
        { userId: bob, fullName: "Alain Térieur", groupId: "g1", moduleType: "ASH" },
        { userId: bob, fullName: "Aude Javel" },
      ],
    });
    assert.equal(await service.importPersonsFromDossiers(bob, bob), 2);
    assert.equal(await service.importPersonsFromDossiers(bob, bob), 0);
    const list = await service.listAgendaPersons(bob);
    assert.deepEqual(list.map((p) => [p.fullName, p.visitsPerPeriod, p.visitPeriod, p.fromDossiers]), [
      ["Alain Térieur", 1, "QUARTER", true],
      ["Aude Javel", 1, "QUARTER", true],
    ]);
  });

});
