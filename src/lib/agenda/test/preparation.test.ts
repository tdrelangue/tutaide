// Thomas, 2026-11-03: « Préparer ma proposition » — towns by urgency, EHPAD inside, exactly the picked persons placed.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createContext } from "../../agenda-engine/domain";
import { buildPreparation, orderTowns } from "../views/preparation";
import { proposePeriod, validatePeriod } from "../bridge/ops/plan";
import { place, protege, state } from "../../agenda-engine/test/domain/fixtures";
import { createTestDb } from "./db";
import { TOURCOING, WEEK, addPerson, depsWith, recordingFetch, seedOwner } from "./bridge-fixtures";

const at = (id: string, lat: number, lon: number, town: string, site?: string) => ({ ...place(id, lat, lon), address: `1 rue ${id} ${town}`, ...(site ? { site } : {}) });

describe("the list to prepare", () => {
  const contacts = [
    protege("calm", "Paul Ochon", { at: at("a", 45.15, 1.53, "19100 Brive-la-Gaillarde"), last: "2026-10-10", period: "QUARTER" }),
    protege("late", "Jean Bonneau", { at: at("b", 45.27, 1.77, "19000 Tulle", "190011395"), last: "2026-06-01", period: "QUARTER" }),
    protege("next", "Aude Javel", { at: at("c", 45.271, 1.771, "19000 Tulle", "190011395"), last: "2026-10-01", period: "QUARTER" }),
    protege("naves", "Sarah Croche", { at: at("d", 45.31, 1.77, "19460 Naves"), last: "2026-10-01", period: "QUARTER" }),
  ];
  const view = buildPreparation(createContext(state({ contacts })).state, "2026-10-19", "2026-10-23");

  it("puts the town of the most urgent person first, with its EHPAD inside", () => {
    assert.equal(view.towns[0]?.name, "Tulle");
    const tulle = view.towns[0];
    assert.equal(tulle?.people[0]?.urgency, "OVERDUE");
    assert.deepEqual(tulle?.sites.map((s) => [s.name, s.personIds.length]), [["EHPAD le Chandou - Tulle", 2]]);
  });

  it("brings the towns next to a picked one up, marked « à côté »", () => {
    const ordered = orderTowns(view.towns, new Set(["late"]));
    assert.deepEqual(ordered.slice(0, 2).map((o) => [o.town.name, o.near]), [["Tulle", false], ["Naves", true]]);
  });
});

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));
beforeAll(async () => ({ client, close } = await createTestDb()));
afterAll(() => close());

describe("a prepared proposal", () => {
  it("places exactly the persons picked and validates that very proposal", async () => {
    const owner = await seedOwner(client, "prepare@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const aude = await addPerson(client, owner, "Aude Javel", { address: TOURCOING, lastVisitOn: "2026-10-15" });
    const choice = { persons: [aude], appointments: [] };
    const proposed = await proposePeriod(owner, WEEK, deps, choice);
    assert.ok(proposed.ok);
    const placed = proposed.proposal.plan.days.flatMap((d) => d.items).filter((i) => !i.task.early).map((i) => i.task.person?.id);
    assert.deepEqual(placed, [aude], "Aude was not due, she is placed because she was picked");
    assert.equal(proposed.proposal.plan.days.flatMap((d) => d.items).some((i) => i.task.person?.id === jean && !i.task.early), false);
    await assert.rejects(validatePeriod(owner, WEEK, proposed.fingerprint, deps), "another choice is another proposal");
    assert.ok((await validatePeriod(owner, WEEK, proposed.fingerprint, deps, choice)) >= 1);
  });

  it("works for a whole month too (the month view proposes a month)", async () => {
    const owner = await seedOwner(client, "prepare-month@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const month = { from: "2026-11-01", to: "2026-11-30" };
    const proposed = await proposePeriod(owner, month, deps, { persons: [jean], appointments: [] });
    assert.ok(proposed.ok);
    const days = new Set(proposed.proposal.plan.days.map((d) => d.date.slice(0, 7)));
    assert.deepEqual([...days], ["2026-11"]);
    assert.ok(proposed.proposal.plan.days.flatMap((d) => d.items).some((i) => i.task.person?.id === jean));
    assert.ok((await validatePeriod(owner, month, proposed.fingerprint, deps, { persons: [jean], appointments: [] })) >= 1);
  });
});
