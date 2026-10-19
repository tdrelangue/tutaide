// Persistent road-time cache: no readable coordinates in the database, 90-day
// retention, validated reads, and a round trip through the engine's real travel model.
import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildTravelModel, pairKey } from "@/lib/agenda-engine/geo";
import type { FetchLike } from "@/lib/agenda-engine/geo";
import type { Place } from "@/lib/agenda-engine/domain";
import {
  RETENTION_DAYS,
  flushRouteCache,
  loadRouteCache,
  routeCacheKey,
} from "../bridge/routeCache";
import { createTestDb, createUser } from "./db";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-19T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
const PAIR = "50.63720,3.06330|50.69070,3.17460";

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
beforeEach(async () => {
  await client.agendaRouteCache.deleteMany();
});

describe("stored key", () => {
  it("is a hex HMAC that does not contain the coordinates", () => {
    const key = routeCacheKey(alice, PAIR);
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.equal(key.includes("50.6372"), false);
    assert.equal(key, routeCacheKey(alice, PAIR));
  });

  it("differs between owners and between pairs", () => {
    assert.notEqual(routeCacheKey(alice, PAIR), routeCacheKey(bob, PAIR));
    assert.notEqual(routeCacheKey(alice, PAIR), routeCacheKey(alice, "1,2|3,4"));
  });

  it("is what the database holds after a flush", async () => {
    const cache = await loadRouteCache(alice, NOW);
    cache.set(PAIR, { km: 12.5, minutes: 21 });
    await flushRouteCache(alice, cache, NOW);
    const rows = await client.agendaRouteCache.findMany({ where: { ownerId: alice } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.pairKey, routeCacheKey(alice, PAIR));
    assert.equal(rows[0]?.pairKey.includes("50.6372"), false);
  });

  it("refuses to work without a valid ENCRYPTION_KEY", async () => {
    const saved = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = "short";
      assert.throws(() => routeCacheKey(alice, PAIR), /ENCRYPTION_KEY/);
      delete process.env.ENCRYPTION_KEY;
      assert.throws(() => routeCacheKey(alice, PAIR), /ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = saved;
    }
  });
});

describe("load / flush", () => {
  it("starts empty and tracks size", async () => {
    const cache = await loadRouteCache(alice, NOW);
    assert.equal(cache.size(), 0);
    assert.equal(cache.get(PAIR), undefined);
    cache.set(PAIR, { km: 1, minutes: 2 });
    assert.equal(cache.size(), 1);
    assert.deepEqual(cache.get(PAIR), { km: 1, minutes: 2 });
  });

  it("persists a value only after flush, and reloads it", async () => {
    const cache = await loadRouteCache(alice, NOW);
    cache.set(PAIR, { km: 12.5, minutes: 21 });
    assert.equal(await client.agendaRouteCache.count(), 0);
    assert.equal(await flushRouteCache(alice, cache, NOW), 1);
    const reloaded = await loadRouteCache(alice, NOW);
    assert.deepEqual(reloaded.get(PAIR), { km: 12.5, minutes: 21 });
    assert.equal(reloaded.size(), 1);
  });

  it("flush is idempotent: nothing pending, nothing written", async () => {
    const cache = await loadRouteCache(alice, NOW);
    cache.set(PAIR, { km: 3, minutes: 4 });
    assert.equal(await flushRouteCache(alice, cache, NOW), 1);
    assert.equal(await flushRouteCache(alice, cache, NOW), 0);
    assert.equal(await flushRouteCache(alice, await loadRouteCache(alice, NOW), NOW), 0);
    assert.equal(await client.agendaRouteCache.count(), 1);
  });

  it("does not duplicate or overwrite a row another session already wrote", async () => {
    const first = await loadRouteCache(alice, NOW);
    const second = await loadRouteCache(alice, NOW);
    first.set(PAIR, { km: 3, minutes: 4 });
    second.set(PAIR, { km: 9, minutes: 9 });
    await flushRouteCache(alice, first, NOW);
    assert.equal(await flushRouteCache(alice, second, NOW), 0);
    const row = await client.agendaRouteCache.findFirstOrThrow({ where: { ownerId: alice } });
    assert.equal(row.km, 3);
  });

  it("keeps owners apart", async () => {
    const a = await loadRouteCache(alice, NOW);
    a.set(PAIR, { km: 5, minutes: 6 });
    await flushRouteCache(alice, a, NOW);
    const b = await loadRouteCache(bob, NOW);
    assert.equal(b.get(PAIR), undefined);
    assert.equal(b.size(), 0);
  });

  it("does not remember invalid values", async () => {
    const cache = await loadRouteCache(alice, NOW);
    cache.set(PAIR, { km: Number.NaN, minutes: 1 });
    cache.set("a|b", { km: 1, minutes: -1 });
    assert.equal(cache.size(), 0);
    assert.equal(await flushRouteCache(alice, cache, NOW), 0);
  });

  it("lets a write failure reach the caller, keeping the entries pending", async () => {
    const cache = await loadRouteCache(alice, NOW);
    cache.set(PAIR, { km: 1, minutes: 1 });
    await assert.rejects(flushRouteCache("no-such-user", cache, NOW));
    assert.equal(await flushRouteCache(alice, cache, NOW), 1);
  });
});

describe("retention", () => {
  async function seed(ownerId: string, pair: string, ageDays: number) {
    const cache = await loadRouteCache(ownerId, NOW);
    cache.set(pair, { km: 7, minutes: 8 });
    await flushRouteCache(ownerId, cache, daysAgo(ageDays));
  }

  it("ignores and purges this owner's rows older than 90 days", async () => {
    assert.equal(RETENTION_DAYS, 90);
    await seed(alice, "old", 91);
    await seed(alice, "fresh", 89);
    const cache = await loadRouteCache(alice, NOW);
    assert.equal(cache.get("old"), undefined);
    assert.deepEqual(cache.get("fresh"), { km: 7, minutes: 8 });
    const left = await client.agendaRouteCache.findMany({ where: { ownerId: alice } });
    assert.deepEqual(left.map((r) => r.pairKey), [routeCacheKey(alice, "fresh")]);
  });

  it("leaves other owners' old rows untouched", async () => {
    await seed(alice, "old", 120);
    await seed(bob, "old", 120);
    await loadRouteCache(alice, NOW);
    assert.equal(await client.agendaRouteCache.count({ where: { ownerId: alice } }), 0);
    assert.equal(await client.agendaRouteCache.count({ where: { ownerId: bob } }), 1);
  });
});

describe("corrupt rows", () => {
  async function seedTwo(ownerId: string) {
    const cache = await loadRouteCache(ownerId, NOW);
    for (const p of ["bad", "ok"]) cache.set(p, { km: 1, minutes: 1 });
    await flushRouteCache(ownerId, cache, NOW);
  }

  it("a negative value is skipped, the good rows are kept", async () => {
    await seedTwo(alice);
    // Raw SQL (test only): plants corruption the application would never write.
    const key = routeCacheKey(alice, "bad");
    await client.$executeRaw`UPDATE "AgendaRouteCache" SET "minutes" = -5 WHERE "pairKey" = ${key}`;
    const reloaded = await loadRouteCache(alice, NOW);
    assert.equal(reloaded.get("bad"), undefined);
    assert.deepEqual(reloaded.get("ok"), { km: 1, minutes: 1 });
    assert.equal(reloaded.size(), 1);
  });

  it("NaN / Infinity (unreadable by the driver) start this owner's cache empty, log the error name and delete nothing", async () => {
    await seedTwo(alice);
    await seedTwo(bob);
    const key = routeCacheKey(alice, "bad");
    await client.$executeRaw`UPDATE "AgendaRouteCache" SET "km" = 'NaN'::float8 WHERE "pairKey" = ${key}`;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const reloaded = await loadRouteCache(alice, NOW);
      assert.equal(reloaded.size(), 0);
      assert.equal(logged.mock.calls.length, 1);
      assert.equal(logged.mock.calls[0]?.[0], "[agenda] route cache unreadable:");
      assert.equal(typeof logged.mock.calls[0]?.[1], "string");
      assert.equal(await client.agendaRouteCache.count({ where: { ownerId: alice } }), 2, "nothing deleted");
      assert.equal(await client.agendaRouteCache.count({ where: { ownerId: bob } }), 2);
      reloaded.set("again", { km: 2, minutes: 2 });
      assert.equal(await flushRouteCache(alice, reloaded, NOW), 1);
    } finally {
      logged.mockRestore();
    }
  });

  it("refuses an ENCRYPTION_KEY that is not 64 hex characters", async () => {
    const original = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = "zz".repeat(32);
      await assert.rejects(loadRouteCache(alice, NOW), /ENCRYPTION_KEY/);
      process.env.ENCRYPTION_KEY = "ab".repeat(31);
      await assert.rejects(loadRouteCache(alice, NOW), /ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});

describe("with the engine's travel model", () => {
  const place = (id: string, lat: number, lon: number): Place => ({
    id,
    label: id,
    address: id,
    lat,
    lon,
  });
  const places = [
    place("lille", 50.6372, 3.0633),
    place("roubaix", 50.6907, 3.1746),
    place("tourcoing", 50.7239, 3.1612),
  ];
  const okFetch = (calls: string[]): FetchLike => async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ distance: 12, duration: 20, distanceUnit: "kilometer", timeUnit: "minute" }),
    };
  };

  it("a second run with a cache reloaded from the database makes no request", async () => {
    const calls: string[] = [];
    const cache = await loadRouteCache(alice, NOW);
    const first = await buildTravelModel(places, { fetch: okFetch(calls), cache });
    assert.equal(calls.length, 3);
    assert.equal(first.estimated.length, 0);
    assert.equal(await flushRouteCache(alice, cache, NOW), 3);

    const again = await buildTravelModel(places, {
      fetch: okFetch(calls),
      cache: await loadRouteCache(alice, NOW),
    });
    assert.equal(calls.length, 3, "no new fetch");
    assert.deepEqual(again.estimated, []);
    const [a, b] = places;
    assert.ok(a && b);
    assert.equal(again.model.km(a, b), first.model.km(a, b));
    assert.equal(again.model.minutes(a, b), first.model.minutes(a, b));
    assert.ok(pairKey(a, b).includes("|"));
  });

  it("another owner does not benefit from the cache", async () => {
    const calls: string[] = [];
    const cache = await loadRouteCache(alice, NOW);
    await buildTravelModel(places, { fetch: okFetch(calls), cache });
    await flushRouteCache(alice, cache, NOW);
    await buildTravelModel(places, { fetch: okFetch(calls), cache: await loadRouteCache(bob, NOW) });
    assert.equal(calls.length, 6);
  });
});
