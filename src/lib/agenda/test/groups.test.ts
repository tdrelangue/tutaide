// Thomas, 2026-11-02: coloured groups, one per contact, made by the user (no « Ad hoc » group given).
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { contactGroupTags, deleteAgendaGroup, listAgendaGroups, moveAgendaGroup, setPersonsGroup, createAgendaGroup, updateAgendaGroup } from "../groups";
import { groupOf, nextFreeColor, sameGroupName, toGroupColor } from "../groups-rules";
import * as service from "../service";
import { createTestDb } from "./db";
import { LILLE, seedOwner } from "./bridge-fixtures";

describe("group rules", () => {
  it("compares names whatever the accents, case and spaces", () => {
    assert.equal(sameGroupName("Ad hoc", "  AD   HOC "), true);
    assert.equal(sameGroupName("Évaluation", "evaluation"), true);
    assert.equal(sameGroupName("Ad hoc", "Mesures"), false);
  });

  it("gives a new group a colour no group uses, and reads unknown colours as grey", () => {
    assert.equal(nextFreeColor(["blue"]), "teal");
    assert.equal(toGroupColor("fuchsia"), "slate");
  });

  it("puts a contact without a group in the first group", () => {
    const groups = [{ id: "a", name: "Mesures", color: "blue" as const }, { id: "b", name: "Ad hoc", color: "orange" as const }];
    assert.equal(groupOf(null, groups)?.id, "a");
    assert.equal(groupOf("b", groups)?.id, "b");
    assert.equal(groupOf("gone", groups)?.id, "a");
    assert.equal(groupOf(null, []), null);
  });
});

let client: PrismaClient;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const person = (fullName: string, groupId: string | null = null) => ({
  fullName,
  groupId,
  address: LILLE,
  visitsPerPeriod: 1,
  visitPeriod: "MONTH" as const,
  visitEvery: 1,
  lastVisitOn: null,
  inEhpad: null,
  visitMinutes: null,
  notes: null,
  phone: null,
  status: "ACTIVE" as const,
  endReason: null,
});

async function personId(ownerId: string, fullName: string): Promise<string> {
  return (await client.agendaContact.findFirstOrThrow({ where: { ownerId, fullName } })).id;
}

describe("groups of an agenda", () => {
  it("starts with « Mesures » only, holding every person", async () => {
    const owner = await seedOwner(client, "groups-start@test.invalid");
    await service.createAgendaPerson(owner, owner, person("Jean Bonneau"));
    const groups = await listAgendaGroups(owner);
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [["Mesures", 1]]);
    assert.deepEqual(await listAgendaGroups(owner), groups, "reading again creates nothing");
  });

  it("creates « Ad hoc », files a person in it, and colours their blocks", async () => {
    const owner = await seedOwner(client, "groups-adhoc@test.invalid");
    await listAgendaGroups(owner);
    await createAgendaGroup(owner, { name: "Ad hoc", color: "orange" });
    const adhoc = (await listAgendaGroups(owner)).find((g) => g.name === "Ad hoc");
    assert.ok(adhoc);
    await service.createAgendaPerson(owner, owner, person("Sarah Croche", adhoc.id));
    await service.createAgendaPerson(owner, owner, person("Paul Ochon"));
    const tags = await contactGroupTags(owner);
    assert.equal(tags.get(await personId(owner, "Sarah Croche"))?.name, "Ad hoc");
    assert.equal(tags.get(await personId(owner, "Paul Ochon"))?.name, "Mesures");
    const [view] = (await service.listAgendaPersons(owner)).filter((p) => p.fullName === "Sarah Croche");
    assert.equal(view?.groupId, adhoc.id);
  });

  it("refuses a second group with the same name, and another agenda's group", async () => {
    const owner = await seedOwner(client, "groups-dup@test.invalid");
    const other = await seedOwner(client, "groups-other@test.invalid");
    await listAgendaGroups(owner);
    const [foreign] = await listAgendaGroups(other);
    assert.ok(foreign);
    await assert.rejects(createAgendaGroup(owner, { name: "  mesures ", color: "red" }), service.AgendaRefusal);
    await assert.rejects(service.createAgendaPerson(owner, owner, person("Jean Bonneau", foreign.id)), service.AgendaRefusal);
    assert.equal(await updateAgendaGroup(owner, foreign.id, { name: "Pris", color: "red" }), false);
    assert.equal(await deleteAgendaGroup(owner, foreign.id), null);
  });

  it("renames and recolours a group", async () => {
    const owner = await seedOwner(client, "groups-rename@test.invalid");
    const [mesures] = await listAgendaGroups(owner);
    assert.ok(mesures);
    assert.equal(await updateAgendaGroup(owner, mesures.id, { name: "Tutelles", color: "green" }), true);
    const [renamed] = await listAgendaGroups(owner);
    assert.deepEqual([renamed?.name, renamed?.color], ["Tutelles", "green"]);
  });

  it("moves a group up: it becomes the default one", async () => {
    const owner = await seedOwner(client, "groups-move@test.invalid");
    await listAgendaGroups(owner);
    await createAgendaGroup(owner, { name: "Ad hoc", color: "orange" });
    await service.createAgendaPerson(owner, owner, person("Jean Bonneau"));
    const adhoc = (await listAgendaGroups(owner)).find((g) => g.name === "Ad hoc");
    assert.ok(adhoc);
    assert.equal(await moveAgendaGroup(owner, adhoc.id, "up"), true);
    const groups = await listAgendaGroups(owner);
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [["Ad hoc", 1], ["Mesures", 0]]);
  });

  it("deleting a group moves its persons, never deletes them; the last group stays", async () => {
    const owner = await seedOwner(client, "groups-delete@test.invalid");
    const [mesures] = await listAgendaGroups(owner);
    assert.ok(mesures);
    await assert.rejects(deleteAgendaGroup(owner, mesures.id), service.AgendaRefusal);
    await createAgendaGroup(owner, { name: "Ad hoc", color: "orange" });
    await service.createAgendaPerson(owner, owner, person("Jean Bonneau"));
    const result = await deleteAgendaGroup(owner, mesures.id);
    assert.deepEqual(result, { moved: 1, into: "Ad hoc" });
    const groups = await listAgendaGroups(owner);
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [["Ad hoc", 1]]);
    assert.equal((await service.listAgendaPersons(owner)).length, 1);
  });

  it("selection mode puts several persons in one group", async () => {
    const owner = await seedOwner(client, "groups-bulk@test.invalid");
    await listAgendaGroups(owner);
    await createAgendaGroup(owner, { name: "Ad hoc", color: "orange" });
    await service.createAgendaPerson(owner, owner, person("Jean Bonneau"));
    await service.createAgendaPerson(owner, owner, person("Sarah Croche"));
    const adhoc = (await listAgendaGroups(owner)).find((g) => g.name === "Ad hoc");
    assert.ok(adhoc);
    const ids = [await personId(owner, "Jean Bonneau"), await personId(owner, "Sarah Croche")];
    assert.equal(await setPersonsGroup(owner, ids, adhoc.id), 2);
    assert.deepEqual((await listAgendaGroups(owner)).map((g) => g.count), [0, 2]);
  });

  it("deleting a person in a group leaves the group", async () => {
    const owner = await seedOwner(client, "groups-person-delete@test.invalid");
    await listAgendaGroups(owner);
    await service.createAgendaPerson(owner, owner, person("Jean Bonneau"));
    assert.equal(await service.deleteAgendaPerson(owner, await personId(owner, "Jean Bonneau")), true);
    assert.deepEqual((await listAgendaGroups(owner)).map((g) => g.count), [0]);
  });
});
