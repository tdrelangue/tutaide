// Run: npx tsx scripts/tests/agenda-service.test.mts
// The agenda service against a real (in-memory) PostgreSQL: PGlite with Tutellia's
// tables, routed through `db` exactly like the demo. Never touches a real database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

const { DEMO_SCHEMA_SQL } = await import("../../src/lib/demo/schema-sql");
const { setDemoRuntime } = await import("../../src/lib/demo/state");
const service = await import("../../src/lib/agenda/service");
const { encrypt } = await import("../../src/lib/encryption");

const pg = new PGlite();
await pg.exec(DEMO_SCHEMA_SQL);
const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
setDemoRuntime({ client, close: async () => undefined, email: "test@demo.tutellia.invalid" });

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function makeUser(email: string): Promise<string> {
  const user = await client.user.create({ data: { email, passwordHash: "x" } });
  return user.id;
}

const alice = await makeUser("alice@test.invalid");
const bob = await makeUser("bob@test.invalid");
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

await check("settings: defaults before anything is saved", async () => {
  const s = await service.getAgendaSettings(alice);
  assert.equal(s.home, null);
  assert.equal(s.dayEndLimitMinutes, 1140);
});

await check("settings: saved, read back, and the home address is encrypted at rest", async () => {
  const input = { home: lille, office: null, workDays: [5, 1, 1], dayStartMinutes: 510, dayEndMinutes: 1080, dayEndLimitMinutes: 1140, defaultVisitMinutes: 45 };
  await service.saveAgendaSettings(alice, input);
  await service.saveAgendaSettings(alice, input);
  const s = await service.getAgendaSettings(alice);
  assert.deepEqual(s.home, lille);
  assert.deepEqual(s.workDays, [1, 5]);
  const row = await client.agendaSettings.findUniqueOrThrow({ where: { ownerId: alice } });
  assert.notEqual(row.homeAddress, lille.label);
  assert.equal(row.version, 1);
});

await check("person: created with its default place; address and notes encrypted at rest", async () => {
  await service.createAgendaPerson(alice, alice, person);
  const view = await onlyPersonOf(alice);
  assert.deepEqual(view.address, roubaix);
  assert.equal(view.notes, person.notes);
  const contact = await client.agendaContact.findFirstOrThrow({ where: { ownerId: alice }, include: { places: true } });
  assert.equal(contact.category, "PROTEGE");
  assert.notEqual(contact.notes, person.notes);
  assert.notEqual(contact.places[0].address, roubaix.label);
});

await check("person: changing the address updates the same place; removing it deletes the place", async () => {
  const before = await client.agendaPlace.findFirstOrThrow({ where: { ownerId: alice } });
  const { id } = await onlyPersonOf(alice);
  assert.equal(await service.updateAgendaPerson(alice, id, { ...person, address: lille }), true);
  const after = await client.agendaPlace.findFirstOrThrow({ where: { ownerId: alice } });
  assert.equal(after.id, before.id);
  assert.deepEqual((await onlyPersonOf(alice)).address, lille);
  await service.updateAgendaPerson(alice, id, { ...person, address: null });
  assert.equal(await client.agendaPlace.count({ where: { ownerId: alice } }), 0);
});

await check("person: an ended measure records its end date, and reopening clears it", async () => {
  const { id } = await onlyPersonOf(alice);
  await service.updateAgendaPerson(alice, id, { ...person, status: "ENDED", endReason: "DECES" });
  const ended = await client.agendaContact.findUniqueOrThrow({ where: { id } });
  assert.notEqual(ended.endedOn, null);
  await service.updateAgendaPerson(alice, id, person);
  const reopened = await client.agendaContact.findUniqueOrThrow({ where: { id } });
  assert.equal(reopened.endedOn, null);
  assert.equal(reopened.endReason, null);
});

await check("isolation: another MJPM can neither see, change nor delete the person", async () => {
  const { id } = await onlyPersonOf(alice);
  assert.equal((await service.listAgendaPersons(bob)).length, 0);
  assert.equal(await service.updateAgendaPerson(bob, id, person), false);
  assert.equal(await service.deleteAgendaPerson(bob, id), false);
  assert.equal((await service.listAgendaPersons(alice)).length, 1);
});

await check("isolation: the database refuses a place attached to another MJPM's contact", async () => {
  const { id } = await onlyPersonOf(alice);
  await assert.rejects(
    client.agendaPlace.create({ data: { ownerId: bob, contactId: id, label: "x", address: "x", lat: 0, lon: 0 } })
  );
});

await check("unreadable: a value that cannot be decrypted fails loudly instead of reading as empty", async () => {
  const { id } = await onlyPersonOf(alice);
  const row = await client.agendaContact.findUniqueOrThrow({ where: { id } });
  await client.agendaContact.update({ where: { id }, data: { notes: "00:11:22" } });
  await assert.rejects(service.listAgendaPersons(alice));
  await client.agendaContact.update({ where: { id }, data: { notes: row.notes } });
  assert.equal((await onlyPersonOf(alice)).notes, person.notes);
});

await check("in use: an appointment at the person's home blocks deleting the person or clearing the address", async () => {
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

await check("delete: where the person was only a participant, their name and home leave items and pins", async () => {
  const { id } = await onlyPersonOf(alice);
  const other = await client.agendaContact.create({ data: { ownerId: alice, category: "FAMILLE", fullName: "Aude Javel" } });
  const day = new Date("2026-10-21T00:00:00.000Z");
  const home = encrypt(roubaix.label);
  const item = await client.agendaItem.create({
    data: {
      ownerId: alice, itemKey: "appt-1", kind: "APPT", title: "Signature avec Jean Bonneau et Aude Javel",
      placeLabel: "Chez Jean", placeAddress: home, placeLat: 50.69, placeLon: 3.17, date: day, startMin: 600,
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

await check("delete: the contact is erased from the validated planning first", async () => {
  const { id } = await onlyPersonOf(alice);
  const day = new Date("2026-10-20T00:00:00.000Z");
  const item = await client.agendaItem.create({
    data: {
      ownerId: alice, itemKey: `${id}@2026-10-20`, kind: "VISIT", contactId: id, title: "Visite Jean Bonneau",
      placeLabel: "Domicile", placeAddress: "secret", placeLat: 50.69, placeLon: 3.17, date: day, startMin: 600,
      endMin: 660, priority: "NORMAL", earliestDate: day, latestDate: day,
    },
  });
  assert.equal(await service.deleteAgendaPerson(alice, id), true);
  const scrubbed = await client.agendaItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(scrubbed.contactId, null);
  assert.equal(scrubbed.title, "Contact supprimé");
  assert.equal(scrubbed.placeAddress, "");
  assert.equal(scrubbed.placeLat, null);
  assert.equal(await client.agendaContact.count({ where: { ownerId: alice } }), 0);
});

await check("import: each dossier group once, with regular visits by default; never twice", async () => {
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

await client.$disconnect();
await pg.close();
console.log(`\n${passed} checks passed`);
