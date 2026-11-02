// Thomas, 2026-11-02: « Contacts » — partners shared by the whole structure, in coloured groups.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createGroup, deleteGroup, listGroups, type GroupScope } from "../groups";
import { addressBookOf, createPartner, deletePartner, listPartners, updatePartner } from "../partners";
import { partnerName } from "../rules";
import * as service from "../service";
import { agendaPartnerSchema } from "../validation";
import { createTestDb } from "./db";
import { LILLE, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const partner = (fields: Partial<Parameters<typeof agendaPartnerSchema.parse>[0]> = {}) =>
  agendaPartnerSchema.parse({ civility: "Me", lastName: "Terieur", firstName: "Alex", company: "Étude Terieur", ...fields });

async function structureWithTwoMembers(name: string): Promise<{ mjpm: string; colleague: string }> {
  const org = await client.organization.create({ data: { name } });
  const mjpm = await seedOwner(client, `${name}-mjpm@test.invalid`);
  const colleague = await seedOwner(client, `${name}-colleague@test.invalid`);
  await client.user.updateMany({ where: { id: { in: [mjpm, colleague] } }, data: { orgId: org.id, orgRole: "MANDATAIRE" } });
  return { mjpm, colleague };
}

describe("partnerName", () => {
  it("writes the person, or the structure when there is no name", () => {
    assert.equal(partnerName({ civility: "Me", firstName: "Alex", lastName: "Terieur", company: "Étude" }), "Me Alex Terieur");
    assert.equal(partnerName({ civility: null, firstName: null, lastName: null, company: "SARL Bricol'" }), "SARL Bricol'");
  });
});

describe("partner form rules", () => {
  it("asks for a name or a structure, and a real e-mail", () => {
    assert.equal(agendaPartnerSchema.safeParse({ company: "Étude Terieur" }).success, true);
    assert.equal(agendaPartnerSchema.safeParse({ role: "Notaire" }).success, false);
    assert.equal(agendaPartnerSchema.safeParse({ lastName: "Terieur", email: "pas-un-mail" }).success, false);
    assert.equal(agendaPartnerSchema.parse({ lastName: "Terieur", email: "  " }).email, null);
  });
});

describe("the address book of a structure", () => {
  it("is shared: a contact added by one member is seen and edited by another", async () => {
    const { mjpm, colleague } = await structureWithTwoMembers("udaf");
    const book = await addressBookOf(mjpm);
    assert.deepEqual(await addressBookOf(colleague), book);
    await createPartner(book, mjpm, partner({ phone: "05 55 00 00 00", email: "etude@test.invalid", address: LILLE }));
    const [seen] = await listPartners(await addressBookOf(colleague));
    assert.ok(seen);
    assert.equal(seen.phone, "05 55 00 00 00");
    assert.equal(seen.address?.label, LILLE.label);
    assert.equal(await updatePartner(book, seen.id, partner({ role: "Notaire associé" })), true);
    assert.equal((await listPartners(book))[0]?.role, "Notaire associé");
  });

  it("keeps phones, e-mail, address and notes encrypted in the database", async () => {
    const { mjpm } = await structureWithTwoMembers("secret");
    const book = await addressBookOf(mjpm);
    await createPartner(book, mjpm, partner({ phone: "06 11 22 33 44", email: "me@test.invalid", notes: "Code 1234" }));
    const row = await client.agendaPartner.findFirstOrThrow({ where: { createdById: mjpm } });
    assert.notEqual(row.phone, "06 11 22 33 44");
    assert.notEqual(row.email, "me@test.invalid");
    assert.notEqual(row.notes, "Code 1234");
  });

  it("is not visible from another structure or a solo account", async () => {
    const { mjpm } = await structureWithTwoMembers("one");
    const { mjpm: other } = await structureWithTwoMembers("two");
    const solo = await seedOwner(client, "solo-partners@test.invalid");
    const book = await addressBookOf(mjpm);
    await createPartner(book, mjpm, partner());
    const [mine] = await listPartners(book);
    assert.ok(mine);
    assert.equal((await listPartners(await addressBookOf(other))).length, 0);
    assert.equal((await listPartners(await addressBookOf(solo))).length, 0);
    assert.equal(await updatePartner(await addressBookOf(other), mine.id, partner({ lastName: "Pirate" })), false);
    assert.equal(await deletePartner(await addressBookOf(solo), mine.id), false);
    assert.equal(await deletePartner(book, mine.id), true);
  });

  it("an account without a structure has its own address book", async () => {
    const solo = await seedOwner(client, "solo-book@test.invalid");
    const book = await addressBookOf(solo);
    assert.deepEqual(book, { userId: solo });
    await createPartner(book, solo, partner({ lastName: null, firstName: null, civility: null, company: "SARL Bricol'" }));
    assert.deepEqual((await listPartners(book)).map(partnerName), ["SARL Bricol'"]);
  });
});

describe("groups of contacts", () => {
  it("start with the usual trades, shared by the structure, apart from the persons' groups", async () => {
    const { mjpm, colleague } = await structureWithTwoMembers("trades");
    const scope: GroupScope = { kind: "PARTNERS", book: await addressBookOf(mjpm) };
    const names = (await listGroups(scope)).map((g) => g.name);
    assert.deepEqual(names, ["Avocats", "Notaires", "Artisans / hommes à tout faire", "Autres partenaires"]);
    const fromColleague = await listGroups({ kind: "PARTNERS", book: await addressBookOf(colleague) });
    assert.deepEqual(fromColleague.map((g) => g.name), names, "the colleague reads the same groups, none created twice");
    assert.deepEqual((await listGroups({ kind: "PERSONS", ownerId: mjpm })).map((g) => g.name), ["Mesures"]);
  });

  it("a contact is filed in a group; deleting the group moves it to the first one", async () => {
    const { mjpm } = await structureWithTwoMembers("files");
    const book = await addressBookOf(mjpm);
    const scope: GroupScope = { kind: "PARTNERS", book };
    await createGroup(scope, { name: "Banques", color: "green" });
    const banques = (await listGroups(scope)).find((g) => g.name === "Banques");
    assert.ok(banques);
    await createPartner(book, mjpm, partner({ groupId: banques.id, lastName: "Crédit", company: null }));
    assert.equal((await listGroups(scope)).find((g) => g.id === banques.id)?.count, 1);
    assert.deepEqual(await deleteGroup(scope, banques.id), { moved: 1, into: "Avocats" });
  });

  it("refuses a group of another structure, or a group of persons, for a contact", async () => {
    const { mjpm } = await structureWithTwoMembers("guard");
    const { mjpm: other } = await structureWithTwoMembers("guard-other");
    const [foreign] = await listGroups({ kind: "PARTNERS", book: await addressBookOf(other) });
    const [persons] = await listGroups({ kind: "PERSONS", ownerId: mjpm });
    assert.ok(foreign && persons);
    const book = await addressBookOf(mjpm);
    await assert.rejects(createPartner(book, mjpm, partner({ groupId: foreign.id })), service.AgendaRefusal);
    await assert.rejects(createPartner(book, mjpm, partner({ groupId: persons.id })), service.AgendaRefusal);
  });
});
