// placesForPeriod / travelFor: which places a period needs, road times from the owner's cache, IGN or estimates.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { PlannerState } from "@/lib/agenda-engine/domain";
import { loadPlannerState } from "../bridge/load";
import { placesForPeriod, travelFor } from "../bridge/travel";
import { createTestDb } from "./db";
import {
  NOW, TOURCOING, VILLENEUVE, WEEK, addPerson, failingFetch, insertItem, recordingFetch, seedOwner,
} from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

async function stateOf(ownerId: string): Promise<PlannerState> {
  const loaded = await loadPlannerState(ownerId, NOW);
  if (!loaded.ok) throw new Error("expected a plannable agenda");
  return loaded.state;
}

describe("placesForPeriod", () => {
  it("lists home, office, the places to visit and the places already held, each once", async () => {
    // Arrange
    const owner = await seedOwner(client, "places@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
    await addPerson(client, owner, "Paul Ochon", { address: VILLENEUVE, lastVisitOn: "2026-10-15" });
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-21", start: 600 });
    const state = await stateOf(owner);
    // Act
    const places = placesForPeriod(state, WEEK.from, WEEK.to);
    // Assert
    const ids = places.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("home") && ids.includes("office"));
    assert.ok(ids.includes(`item:${jean}@2026-10-01`), "held item");
    assert.equal(places.some((p) => p.address === TOURCOING.label), true, "Aude is due this week");
    assert.equal(places.some((p) => p.address === VILLENEUVE.label), false, "Paul is not due this week");
  });

  it("includes pins dropped inside the period and ignores those outside it", async () => {
    const owner = await seedOwner(client, "pins-places@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const base = await stateOf(owner);
    const pinAt = (date: string, key: string) => ({
      id: key, kind: "VISIT" as const, apptId: null, personId: jean, title: "Visite", participants: [jean],
      place: { id: `item:${key}`, label: "Chez Jean", address: VILLENEUVE.label, lat: VILLENEUVE.lat, lon: VILLENEUVE.lon },
      dur: 60, priority: "NORMAL" as const, date, start: 600,
    });
    const state: PlannerState = { ...base, pins: [pinAt("2026-10-21", "in-week"), pinAt("2026-11-30", "far-away")] };
    const places = placesForPeriod(state, WEEK.from, WEEK.to);
    assert.equal(places.some((p) => p.id === "item:in-week"), true);
    assert.equal(places.some((p) => p.id === "item:far-away"), false);
  });
});

describe("travelFor", () => {
  async function agendaWithTwoVisits(email: string) {
    const owner = await seedOwner(client, email);
    await addPerson(client, owner, "Jean Bonneau");
    await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
    return { owner, state: await stateOf(owner) };
  }

  it("asks IGN once per pair of distinct places, then serves the owner's cache without any request", async () => {
    // Arrange
    const { owner, state } = await agendaWithTwoVisits("travel-ok@test.invalid");
    const urls: string[] = [];
    // Act
    const first = await travelFor(owner, state, WEEK, { fetch: recordingFetch(urls), now: NOW, ignMinIntervalMs: 0 });
    const askedFirst = urls.length;
    const second = await travelFor(owner, state, WEEK, { fetch: recordingFetch(urls), now: NOW, ignMinIntervalMs: 0 });
    // Assert
    assert.equal(askedFirst, 3, "home, Roubaix, Tourcoing: three pairs");
    assert.equal(urls.length, askedFirst, "second run is served from the cache");
    assert.deepEqual(first.estimated, []);
    assert.deepEqual(second.estimated, []);
    assert.equal(await client.agendaRouteCache.count({ where: { ownerId: owner } }), 3);
  });

  it("never reuses another owner's cached road times", async () => {
    const { owner: first, state: stateA } = await agendaWithTwoVisits("travel-a@test.invalid");
    const { owner: second, state: stateB } = await agendaWithTwoVisits("travel-b@test.invalid");
    const urls: string[] = [];
    await travelFor(first, stateA, WEEK, { fetch: recordingFetch(urls), now: NOW, ignMinIntervalMs: 0 });
    await travelFor(second, stateB, WEEK, { fetch: recordingFetch(urls), now: NOW, ignMinIntervalMs: 0 });
    assert.equal(urls.length, 6);
  });

  it("reports estimated road times when IGN fails, still answers, and caches nothing", async () => {
    const { owner, state } = await agendaWithTwoVisits("travel-down@test.invalid");
    const matrix = await travelFor(owner, state, WEEK, { fetch: failingFetch, now: NOW, ignMinIntervalMs: 0 });
    assert.equal(matrix.estimated.length > 0, true);
    const [a, b] = placesForPeriod(state, WEEK.from, WEEK.to).slice(2, 4);
    assert.ok(a && b);
    assert.ok(matrix.model.minutes(a, b) > 0);
    assert.equal(await client.agendaRouteCache.count({ where: { ownerId: owner } }), 0);
  });

  it("still returns the matrix when the stored cache cannot be loaded, and saves nothing", async () => {
    const { owner, state } = await agendaWithTwoVisits("travel-loadfail@test.invalid");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const key = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = "not-a-key";
      const urls: string[] = [];
      const matrix = await travelFor(owner, state, WEEK, { fetch: recordingFetch(urls), now: NOW, ignMinIntervalMs: 0 });
      assert.deepEqual(matrix.estimated, []);
      assert.equal(urls.length, 3, "road times were asked, an empty cache was used");
      assert.equal(String(log.mock.calls[0]?.[0]).includes("route cache not loaded"), true);
      assert.equal(log.mock.calls.length, 1, "no flush attempted on the empty in-memory cache");
      assert.equal(await client.agendaRouteCache.count({ where: { ownerId: owner } }), 0);
    } finally {
      process.env.ENCRYPTION_KEY = key;
      log.mockRestore();
    }
  });

  it("still returns the matrix when the cache cannot be saved", async () => {
    const { state } = await agendaWithTwoVisits("travel-cachefail@test.invalid");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // "no-such-user" violates the cache's owner foreign key on flush.
      const matrix = await travelFor("no-such-user", state, WEEK, { fetch: recordingFetch([]), now: NOW, ignMinIntervalMs: 0 });
      assert.deepEqual(matrix.estimated, []);
      assert.equal(log.mock.calls.length, 1);
      assert.equal(String(log.mock.calls[0]?.[0]).includes("route cache not saved"), true);
    } finally {
      log.mockRestore();
    }
  });
});
