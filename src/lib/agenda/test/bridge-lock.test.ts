// The per-owner planning lock: a write computed on a stale state is refused, and nothing is written.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAppointment, deleteAppointment } from "../appointments";
import type { AppointmentInput } from "../appointments";
import { AgendaConflict } from "../bridge/errors";
import { lockPlanning } from "../bridge/lock";
import { loadPlannerState } from "../bridge/load";
import { addAppointment, placeInFreeSlot } from "../bridge/ops/insert";
import { proposePeriod, validatePeriod } from "../bridge/ops/plan";
import type { PlanDeps } from "../bridge/ops/plan";
import { createTestDb } from "./db";
import { NOW, WEEK, addPerson, depsWith, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const versionOf = async (ownerId: string) => (await client.agendaSettings.findUniqueOrThrow({ where: { ownerId } })).version;
const bumpVersion = (ownerId: string) => client.agendaSettings.update({ where: { ownerId }, data: { version: { increment: 1 } } });
const forgetRoutes = () => client.agendaRouteCache.deleteMany();

/** Deps whose road-time lookup (called between the read of the state and the write) runs `hook` first. */
function depsWithHook(hook: () => Promise<void>): PlanDeps {
  const inner = recordingFetch([]);
  return {
    now: NOW,
    fetch: async (url, init) => {
      await hook();
      return inner(url, init);
    },
  };
}

const appointment = (): AppointmentInput => ({
  title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60,
  when: { kind: "WEEK", from: WEEK.from, to: WEEK.to }, priority: "HIGH",
});

describe("lockPlanning", () => {
  it("increments the settings version when it matches and refuses a stale one", async () => {
    const owner = await seedOwner(client, "lock-unit@test.invalid");
    const loaded = await loadPlannerState(owner, NOW);
    assert.ok(loaded.ok);
    const version = loaded.ok ? loaded.version : -1;
    await client.$transaction((tx) => lockPlanning(tx, owner, version));
    assert.equal(await versionOf(owner), version + 1);
    await assert.rejects(client.$transaction((tx) => lockPlanning(tx, owner, version)), AgendaConflict);
    assert.equal(await versionOf(owner), version + 1, "a refused lock changes nothing");
  });

  it("is per owner: another owner's write does not make this one stale", async () => {
    const mine = await seedOwner(client, "lock-mine@test.invalid");
    const theirs = await seedOwner(client, "lock-theirs@test.invalid");
    const before = await versionOf(mine);
    await bumpVersion(theirs);
    await client.$transaction((tx) => lockPlanning(tx, mine, before));
  });
});

describe("planning writes on a stale state", () => {
  it("validatePeriod refuses a plan computed before the planning moved, and writes nothing", async () => {
    // Arrange: the user saw a plan; then, while the server recomputes it, someone else writes.
    const owner = await seedOwner(client, "lock-validate@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const proposed = await proposePeriod(owner, WEEK, deps);
    assert.ok(proposed.ok);
    await forgetRoutes();
    const stale = depsWithHook(async () => void (await bumpVersion(owner)));
    // Act + Assert
    await assert.rejects(validatePeriod(owner, WEEK, proposed.ok ? proposed.fingerprint : "", stale), AgendaConflict);
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner } }), 0);
  });

  it("two appointments placed into the same slot from the same loaded state: the second is refused", async () => {
    // Arrange: a validated week and two appointments that both want the first free slot.
    const owner = await seedOwner(client, "lock-slot@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const proposed = await proposePeriod(owner, WEEK, deps);
    assert.ok(proposed.ok);
    await validatePeriod(owner, WEEK, proposed.ok ? proposed.fingerprint : "", deps);
    const first = await addAppointment(owner, owner, appointment(), deps);
    const second = await addAppointment(owner, owner, appointment(), deps);
    if (first.kind !== "NEEDS_INSERT" || second.kind !== "NEEDS_INSERT") throw new Error("expected two urgent insertions");
    const slot = first.options[0];
    assert.ok(slot);
    await forgetRoutes();
    const concurrent = depsWithHook(() => placeInFreeSlot(owner, first.appointmentId, { date: slot.date, start: slot.start }, deps));
    // Act: the second one has loaded its state when the first one is written.
    await assert.rejects(placeInFreeSlot(owner, second.appointmentId, { date: slot.date, start: slot.start }, concurrent), AgendaConflict);
    // Assert: only the first one was written.
    const rows = await client.agendaItem.findMany({ where: { ownerId: owner, kind: "APPT" } });
    assert.deepEqual(rows.map((r) => r.appointmentId), [first.appointmentId]);
  });

  it("deleteAppointment queues behind the planning lock (the version moves)", async () => {
    const owner = await seedOwner(client, "lock-delete@test.invalid");
    const id = await createAppointment(owner, owner, appointment());
    const before = await versionOf(owner);
    assert.equal(await deleteAppointment(owner, id, new Date("2026-10-19T00:00:00Z")), true);
    assert.equal(await versionOf(owner), before + 1);
  });
});
