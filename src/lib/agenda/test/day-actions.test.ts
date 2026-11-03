// Thomas, 2026-11-03: « au bureau ce jour-là » (one date) and « reprogrammer » a half-day; plus the temporary address.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { moveDayPart, officeDayOf, setOfficeDay } from "../day-actions";
import { proposePeriod } from "../bridge/ops/plan";
import * as service from "../service";
import { createTestDb } from "./db";
import { TOURCOING, WEEK, addPerson, depsWith, insertItem, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));
beforeAll(async () => ({ client, close } = await createTestDb()));
afterAll(() => close());

describe("au bureau ce jour-là", () => {
  it("keeps that morning free of visits, that date only, and can be cleared", async () => {
    const owner = await seedOwner(client, "office-day@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    await setOfficeDay(owner, "2026-10-19", "DAY");
    assert.equal(await officeDayOf(owner, "2026-10-19"), "DAY");
    const proposed = await proposePeriod(owner, WEEK, deps);
    assert.ok(proposed.ok);
    const monday = proposed.proposal.plan.days.find((d) => d.date === "2026-10-19");
    assert.equal(monday?.items.length ?? 0, 0, "nothing proposed on the office day");
    await setOfficeDay(owner, "2026-10-19", null);
    assert.equal(await officeDayOf(owner, "2026-10-19"), null);
  });
});

describe("reprogrammer", () => {
  it("moves the morning's validated round to another day, same hours; leaves what would overlap", async () => {
    const owner = await seedOwner(client, "move-day@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const aude = await addPerson(client, owner, "Aude Javel");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-20`, contactId: jean, title: "Visite à Jean", date: "2026-10-19", start: 540 });
    await insertItem(client, owner, { itemKey: `${aude}@2026-10-20`, contactId: aude, title: "Visite à Aude", date: "2026-10-19", start: 660 });
    await insertItem(client, owner, { itemKey: `${aude}@2026-11-20`, contactId: aude, title: "Visite déjà là", date: "2026-10-26", start: 660 });
    const report = await moveDayPart(owner, "2026-10-19", "MORNING", "2026-10-26");
    assert.deepEqual(report, { moved: 1, kept: 1 });
    const jeanItem = await client.agendaItem.findFirstOrThrow({ where: { ownerId: owner, itemKey: `${jean}@2026-10-20` } });
    assert.deepEqual([jeanItem.date.toISOString().slice(0, 10), jeanItem.startMin, jeanItem.moved], ["2026-10-26", 540, true]);
  });
});

describe("adresse temporaire", () => {
  it("is saved apart from the usual address, read back, and used for the visits of its dates", async () => {
    const owner = await seedOwner(client, "temp-address@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const person = (await service.listAgendaPersons(owner)).find((p) => p.id === jean);
    assert.ok(person);
    await service.updateAgendaPerson(owner, jean, { ...person, tempAddress: { address: TOURCOING, from: "2026-10-01", to: "2026-10-31" } });
    const after = (await service.listAgendaPersons(owner)).find((p) => p.id === jean);
    assert.equal(after?.address?.label, person.address?.label, "the usual address never changes");
    assert.equal(after?.tempAddress?.address.label, TOURCOING.label);
    const proposed = await proposePeriod(owner, WEEK, deps);
    assert.ok(proposed.ok);
    const visit = proposed.proposal.plan.days.flatMap((d) => d.items).find((i) => i.task.person?.id === jean);
    assert.equal(visit?.task.place.address, TOURCOING.label);
    await service.updateAgendaPerson(owner, jean, { ...person, tempAddress: null });
    assert.equal((await service.listAgendaPersons(owner)).find((p) => p.id === jean)?.tempAddress, null);
  });
});
