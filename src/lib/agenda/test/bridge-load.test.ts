// loadPlannerState: one owner's rows, decrypted and mapped to the engine's state, nothing of anyone else's.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadPlannerState } from "../bridge/load";
import { createTestDb, createUser } from "./db";
import { NOW, TODAY, addPerson, insertItem, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

async function loadOk(ownerId: string) {
  const loaded = await loadPlannerState(ownerId, NOW);
  if (!loaded.ok) throw new Error("expected a plannable agenda");
  return loaded;
}

describe("owner isolation", () => {
  it("never shows one owner's contacts, items or overrides in another owner's state", async () => {
    // Arrange
    const alice = await seedOwner(client, "alice-iso@test.invalid");
    const bob = await seedOwner(client, "bob-iso@test.invalid");
    const jean = await addPerson(client, alice, "Jean Bonneau");
    const paul = await addPerson(client, bob, "Paul Ochon");
    await insertItem(client, alice, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-12", start: 600 });
    await insertItem(client, bob, { itemKey: `${paul}@2026-10-01`, contactId: paul, title: "Visite à Paul Ochon", date: "2026-10-12", start: 600 });
    await client.agendaOccurrenceOverride.create({
      data: { ownerId: bob, occurrenceKey: `${paul}@2026-10-01`, contactId: paul, dueOn: new Date("2026-10-01T00:00:00Z"), skipped: true },
    });
    // Act
    const forAlice = await loadOk(alice);
    const forBob = await loadOk(bob);
    // Assert
    assert.deepEqual(forAlice.state.contacts.map((c) => c.name), ["Jean Bonneau"]);
    assert.deepEqual(forAlice.state.validated.map((v) => v.title), ["Visite à Jean Bonneau"]);
    assert.deepEqual(forAlice.state.skips, []);
    assert.deepEqual(forBob.state.contacts.map((c) => c.name), ["Paul Ochon"]);
    assert.deepEqual(forBob.state.skips, [`${paul}@2026-10-01`]);
  });
});

describe("settings", () => {
  it("returns ok:false NO_HOME for an owner who never saved settings, with today in Paris", async () => {
    // Arrange
    const carol = await createUser(client, "carol@test.invalid");
    // Act
    const loaded = await loadPlannerState(carol, NOW);
    // Assert
    assert.equal(loaded.ok, false);
    assert.equal(loaded.issues[0]?.reason, "NO_HOME");
    assert.equal(loaded.ok ? null : loaded.today, TODAY);
  });

  it("returns ok:false NO_HOME when the settings have no home address", async () => {
    const noHome = { home: null, office: null, workDays: [1], dayStartMinutes: 510, dayEndMinutes: 1080, dayEndLimitMinutes: null, defaultVisitMinutes: 60 };
    const dave = await seedOwner(client, "dave@test.invalid", noHome);
    const loaded = await loadPlannerState(dave, NOW);
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.issues.map((i) => [i.kind, i.reason]), [["settings", "NO_HOME"]]);
  });

  it("computes today in the owner's timezone, not the server's", async () => {
    const erin = await seedOwner(client, "erin@test.invalid");
    await client.agendaSettings.update({ where: { ownerId: erin }, data: { timezone: "Pacific/Pago_Pago" } });
    const { state } = await loadOk(erin);
    // 2026-10-19 08:00 UTC is still Sunday evening (21:00) in American Samoa.
    assert.equal(state.today, "2026-10-18");
  });

  it("decrypts the home address and coordinates into the engine's settings", async () => {
    const frank = await seedOwner(client, "frank@test.invalid");
    const { state } = await loadOk(frank);
    assert.equal(state.settings.home.address, "Place du Théâtre, 59000 Lille");
    assert.equal(state.settings.home.lat, 50.6372);
    assert.deepEqual(state.settings.workDays, [1, 2, 3, 4, 5]);
  });

  it("throws on an unreadable value instead of showing an empty agenda", async () => {
    const gina = await seedOwner(client, "gina@test.invalid");
    await client.agendaSettings.update({ where: { ownerId: gina }, data: { homeAddress: "00:11:22" } });
    await assert.rejects(loadPlannerState(gina, NOW));
  });
});

describe("items", () => {
  it("keeps VALIDATED in the plan, turns MISSED into history and leaves CANCELLED out", async () => {
    // Arrange
    const hugo = await seedOwner(client, "hugo@test.invalid");
    const jean = await addPerson(client, hugo, "Jean Bonneau");
    const aude = await addPerson(client, hugo, "Aude Javel");
    const paul = await addPerson(client, hugo, "Paul Ochon");
    await insertItem(client, hugo, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-21", start: 600 });
    const missed = await insertItem(client, hugo, { itemKey: `${aude}@2026-10-01`, contactId: aude, title: "Visite à Aude Javel", date: "2026-10-12", start: 600, status: "MISSED" });
    await client.agendaItem.update({ where: { id: missed.id }, data: { itemKey: `MISSED:${missed.id}` } });
    await insertItem(client, hugo, { itemKey: `CANCELLED:${paul}`, contactId: paul, title: "Visite à Paul Ochon", date: "2026-10-13", start: 600, status: "CANCELLED" });
    // Act
    const { state } = await loadOk(hugo);
    // Assert
    assert.deepEqual(state.validated.map((v) => v.id), [`${jean}@2026-10-01`]);
    assert.deepEqual(state.past.map((p) => [p.date, p.held, p.participants]), [["2026-10-12", false, [aude]]]);
    assert.equal(state.validated.some((v) => v.title.includes("Paul")), false);
    assert.equal(state.past.some((p) => p.title.includes("Paul")), false);
  });

  it("reads the encrypted place of a stored item", async () => {
    const ines = await seedOwner(client, "ines@test.invalid");
    const jean = await addPerson(client, ines, "Jean Bonneau");
    const row = await insertItem(client, ines, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite", date: "2026-10-21", start: 600 });
    assert.notEqual(row.placeAddress, "Résidence Les Tilleuls, 59100 Roubaix");
    const { state } = await loadOk(ines);
    assert.equal(state.validated[0]?.place.address, "Résidence Les Tilleuls, 59100 Roubaix");
    assert.equal(state.validated[0]?.place.lat, 50.6907);
  });
});

describe("timezone and version", () => {
  it("falls back on Europe/Paris and reports BAD_TIMEZONE when the stored zone is invalid, instead of throwing", async () => {
    const owner = await seedOwner(client, "tz-bad@test.invalid");
    const settings = await client.agendaSettings.update({ where: { ownerId: owner }, data: { timezone: "Mars/Olympus" } });
    const loaded = await loadOk(owner);
    assert.equal(loaded.state.today, TODAY);
    assert.deepEqual(loaded.issues.filter((i) => i.reason === "BAD_TIMEZONE"), [{ kind: "settings", id: settings.id, reason: "BAD_TIMEZONE" }]);
  });

  it("keeps a valid zone: Pacific/Auckland is already on the next day", async () => {
    const owner = await seedOwner(client, "tz-ok@test.invalid");
    await client.agendaSettings.update({ where: { ownerId: owner }, data: { timezone: "Pacific/Auckland" } });
    const loaded = await loadOk(owner);
    assert.equal(loaded.state.today, "2026-10-19");
    assert.equal(loaded.issues.some((i) => i.reason === "BAD_TIMEZONE"), false);
  });

  it("still reports BAD_TIMEZONE when nothing can be planned (no home)", async () => {
    const owner = await seedOwner(client, "tz-nohome@test.invalid");
    await client.agendaSettings.update({ where: { ownerId: owner }, data: { timezone: "Nope/Nope", homePoint: null } });
    const loaded = await loadPlannerState(owner, NOW);
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.issues.map((i) => i.reason).sort(), ["BAD_TIMEZONE", "NO_HOME"]);
  });

  it("returns the settings version, which saving the settings moves", async () => {
    const owner = await seedOwner(client, "version@test.invalid");
    const before = await loadOk(owner);
    await client.agendaSettings.update({ where: { ownerId: owner }, data: { version: { increment: 1 } } });
    assert.equal((await loadOk(owner)).version, before.version + 1);
  });
});

describe("issues", () => {
  it("reports a malformed rule and an unsupported one without using them", async () => {
    // Arrange
    const jade = await seedOwner(client, "jade@test.invalid");
    const bad = await client.agendaRule.create({
      data: { ownerId: jade, type: "UNAVAILABLE", label: "Mercredi après-midi", strength: "HARD", dow: 3, allDay: false, fromMin: null, toMin: null },
    });
    const bounded = await client.agendaRule.create({
      data: {
        ownerId: jade, type: "UNAVAILABLE", label: "Mardis de novembre", strength: "HARD", dow: 2, allDay: true,
        fromDate: new Date("2026-11-01T00:00:00Z"), toDate: new Date("2026-11-30T00:00:00Z"),
      },
    });
    const good = await client.agendaRule.create({ data: { ownerId: jade, type: "UNAVAILABLE", label: "Vendredi", strength: "HARD", dow: 5, allDay: true } });
    // Act
    const loaded = await loadOk(jade);
    // Assert
    assert.deepEqual(loaded.state.rules.map((r) => r.id), [good.id]);
    assert.deepEqual(
      loaded.issues.map((i) => `${i.kind}:${i.id}:${i.reason}`).sort(),
      [`rule:${bad.id}:BAD_RULE`, `rule:${bounded.id}:UNSUPPORTED_RULE`].sort(),
    );
  });

  it("reports a person whose last visit is unknown and keeps them plannable", async () => {
    const kim = await seedOwner(client, "kim@test.invalid");
    const jean = await addPerson(client, kim, "Jean Bonneau", { lastVisitOn: null });
    const loaded = await loadOk(kim);
    assert.deepEqual(loaded.issues.map((i) => [i.id, i.reason]), [[jean, "LAST_VISIT_UNKNOWN"]]);
    assert.equal(loaded.state.contacts[0]?.visits?.lastVisit, "2026-09-19");
  });
});
