// Thomas, 2026-11-02: EHPAD residents (afternoon, grouped), « tous les N », last visit, « pas de visite
// régulière », and the new appointment places (chez le majeur protégé, à l'extérieur).
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAppointment, deleteAppointment } from "../appointments";
import type { AppointmentInput } from "../appointments";
import { mapContact } from "../bridge/map/contacts";
import { findEhpad, livesInEhpad } from "../ehpad";
import { formatFrequency, toEveryForm } from "../rules";
import { seal, sealPoint } from "../sealed";
import * as service from "../service";
import { createTestDb } from "./db";
import { LILLE, seedOwner } from "./bridge-fixtures";
import { contactRow, placeRow } from "./map-fixtures";

const CORNIL = { lat: 45.207798, lon: 1.691263 };

describe("findEhpad: an address is an EHPAD of Corrèze", () => {
  it("recognises the EHPAD de Cornil by its street, written in any usual way", () => {
    assert.equal(findEhpad("32 Grand'Rue 19150 Cornil", null)?.name, "EHPAD Cornil");
    assert.equal(findEhpad("32 GRAND RUE, 19150 CORNIL", null)?.name, "EHPAD Cornil");
  });

  it("recognises it by its position, whatever the address says", () => {
    assert.equal(findEhpad("Maison, 19150 Cornil", { lat: CORNIL.lat + 0.0002, lon: CORNIL.lon })?.id, "190002113");
  });

  it("does not mistake a neighbour of the same street for the EHPAD", () => {
    assert.equal(findEhpad("12 Grand'Rue 19150 Cornil", { lat: CORNIL.lat + 0.003, lon: CORNIL.lon }), null);
    assert.equal(findEhpad("3 rue du Port 35000 Rennes", { lat: 48.1, lon: -1.68 }), null);
  });

  it("follows the address unless the box was ticked or unticked by hand", () => {
    assert.equal(livesInEhpad(null, "32 Grand'Rue 19150 Cornil", null), true);
    assert.equal(livesInEhpad(null, "EHPAD Les Lilas, 59000 Lille", null), true);
    assert.equal(livesInEhpad(false, "32 Grand'Rue 19150 Cornil", null), false);
    assert.equal(livesInEhpad(true, "3 rue du Port", null), true);
    assert.equal(livesInEhpad(null, null, null), false);
  });
});

describe("frequency « tous les N »", () => {
  it("reads naturally", () => {
    assert.equal(formatFrequency(1, "QUARTER"), "Tous les trimestres");
    assert.equal(formatFrequency(1, "WEEK", 2), "Toutes les 2 semaines");
    assert.equal(formatFrequency(1, "MONTH", 3), "Tous les 3 mois");
    assert.equal(formatFrequency(2, "MONTH"), "2 visites par mois");
  });

  it("shows an older « N visites par période » as the same rhythm", () => {
    assert.deepEqual(toEveryForm(2, "MONTH", 1), { every: 2, period: "WEEK" });
    assert.deepEqual(toEveryForm(3, "QUARTER", 1), { every: 1, period: "MONTH" });
    assert.deepEqual(toEveryForm(1, "MONTH", 2), { every: 2, period: "MONTH" });
  });
});

describe("mapContact: EHPAD residents and « tous les N »", () => {
  const TODAY = "2026-10-19";
  const cornil = placeRow({ address: seal("32 Grand'Rue 19150 Cornil"), point: sealPoint(CORNIL) });

  it("passes the « tous les N » to the engine", () => {
    const { value } = mapContact({ row: contactRow({ visitsPerPeriod: 1, visitPeriod: "WEEK", visitEvery: 2, lastVisitOn: new Date("2026-10-01") }), places: [placeRow()], avails: [] }, TODAY);
    assert.equal(value?.visits?.every, 2);
  });

  it("a resident is seen in the afternoon only, and their place carries the EHPAD", () => {
    const { value } = mapContact({ row: contactRow(), places: [cornil], avails: [] }, TODAY);
    assert.equal(value?.places[0]?.site, "190002113");
    assert.deepEqual(value?.avail, [{ dows: [1, 2, 3, 4, 5, 6, 7], from: 14 * 60, to: 17 * 60 + 30 }]);
  });

  it("cuts the person's own availability to the afternoon", () => {
    const avails = [{ id: "a1", contactId: "c1", dows: [2], fromMin: 9 * 60, toMin: 16 * 60 }];
    const { value } = mapContact({ row: contactRow(), places: [cornil], avails }, TODAY);
    assert.deepEqual(value?.avail, [{ dows: [2], from: 14 * 60, to: 16 * 60 }]);
  });

  it("leaves the box unticked by hand alone, and a non-resident untouched", () => {
    const unticked = mapContact({ row: contactRow({ inEhpad: false }), places: [cornil], avails: [] }, TODAY).value;
    assert.equal(unticked?.avail, null);
    assert.equal(unticked?.places[0]?.site, undefined);
    assert.equal(mapContact({ row: contactRow(), places: [placeRow()], avails: [] }, TODAY).value?.avail, null);
  });
});

let client: PrismaClient;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const person = {
  fullName: "Jean Bonneau",
  address: LILLE,
  visitsPerPeriod: 1,
  visitPeriod: "WEEK" as const,
  visitEvery: 2,
  lastVisitOn: "2026-10-01",
  inEhpad: true,
  visitMinutes: null,
  notes: null,
  phone: null,
  status: "ACTIVE" as const,
  endReason: null,
};

describe("the person's file", () => {
  it("keeps « tous les N », the last visit and the EHPAD box", async () => {
    const owner = await seedOwner(client, "file@test.invalid");
    await service.createAgendaPerson(owner, owner, person);
    const [view] = await service.listAgendaPersons(owner);
    assert.equal(view?.visitEvery, 2);
    assert.equal(view?.lastVisitOn, "2026-10-01");
    assert.equal(view?.inEhpad, true);
  });

  it("may have no regular visits at all", async () => {
    const owner = await seedOwner(client, "none@test.invalid");
    await service.createAgendaPerson(owner, owner, { ...person, visitsPerPeriod: null, visitPeriod: null });
    const [view] = await service.listAgendaPersons(owner);
    assert.equal(view?.visitPeriod, null);
    assert.equal(view?.visitEvery, 1);
  });
});

const appointment = (place: AppointmentInput["place"], participantIds: string[] = []): AppointmentInput => ({
  title: "Rendez-vous", participantIds, place, durationMin: 30, priority: "NORMAL",
  when: { kind: "RANGE", from: "2026-10-19", to: "2026-10-23" },
});

describe("appointment places", () => {
  it("« chez le majeur protégé » is the address on the person's file", async () => {
    const owner = await seedOwner(client, "person-place@test.invalid");
    await service.createAgendaPerson(owner, owner, person);
    const contact = await client.agendaContact.findFirstOrThrow({ where: { ownerId: owner }, include: { places: true } });
    const id = await createAppointment(owner, owner, appointment({ kind: "PERSON", personId: contact.id }, [contact.id]));
    const row = await client.agendaAppointment.findUniqueOrThrow({ where: { id } });
    assert.equal(row.placeKind, "PLACE");
    assert.equal(row.placeId, contact.places[0]?.id);
  });

  it("refuses « chez le majeur protégé » for a person without an address", async () => {
    const owner = await seedOwner(client, "no-address@test.invalid");
    await service.createAgendaPerson(owner, owner, { ...person, address: null });
    const contact = await client.agendaContact.findFirstOrThrow({ where: { ownerId: owner } });
    await assert.rejects(createAppointment(owner, owner, appointment({ kind: "PERSON", personId: contact.id })), service.AgendaRefusal);
    assert.equal(await client.agendaAppointment.count({ where: { ownerId: owner } }), 0);
  });

  it("« à l'extérieur » keeps the typed address, encrypted, and removes it with the appointment", async () => {
    const owner = await seedOwner(client, "outside@test.invalid");
    const id = await createAppointment(owner, owner, appointment({ kind: "OUTSIDE", label: "Étude du notaire", address: LILLE }));
    const row = await client.agendaAppointment.findUniqueOrThrow({ where: { id }, include: { place: true } });
    assert.equal(row.place?.label, "Étude du notaire");
    assert.equal(row.place?.contactId, null);
    assert.notEqual(row.place?.address, LILLE.label);
    assert.equal(await deleteAppointment(owner, id, new Date("2026-10-19T00:00:00.000Z")), true);
    assert.equal(await client.agendaPlace.count({ where: { ownerId: owner } }), 0);
  });
});
