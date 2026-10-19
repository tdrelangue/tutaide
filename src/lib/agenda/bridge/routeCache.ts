/**
 * Persistent road-time cache for the planner (IGN answers kept between sessions).
 *
 * Privacy: the database never holds coordinates. The stored key is
 * HMAC-SHA256(`${ownerId}|${pairKey}`), keyed by a secret derived (HKDF) from
 * ENCRYPTION_KEY, so the same pair gives different keys for different owners and
 * the key cannot be reversed or guessed without the secret.
 *
 * The engine's TravelCache is synchronous: `loadRouteCache` reads everything for
 * the owner up front, `set` fills memory and a pending list, and
 * `flushRouteCache` writes the pending list once planning is done.
 */
import { createHmac, hkdfSync } from "node:crypto";
import { db } from "@/lib/db";
import type { RouteTime, TravelCache } from "@/lib/agenda-engine/geo";

/** Rows older than this are ignored and deleted when the cache is loaded. */
export const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const DERIVED_KEY_BYTES = 32;
const HKDF_INFO = "agenda-route-cache";

interface StoredRoute {
  readonly pairKey: string;
  readonly km: number;
  readonly minutes: number;
}

export interface PendingRoute {
  /** Hashed key, as stored. */
  readonly key: string;
  readonly value: RouteTime;
}

/** The engine's synchronous cache plus the bookkeeping needed to persist it. */
export interface DbTravelCache extends TravelCache {
  /** Entries set since the last successful flush. */
  pending(): readonly PendingRoute[];
  /** Forget the given entries (called by flush after a successful write). */
  markFlushed(entries: readonly PendingRoute[]): void;
}

function deriveKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !KEY_PATTERN.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be set (64 hex characters)");
  }
  const salt = Buffer.alloc(0);
  const derived = hkdfSync("sha256", Buffer.from(hex, "hex"), salt, HKDF_INFO, DERIVED_KEY_BYTES);
  return Buffer.from(derived);
}

function hmacHex(key: Buffer, ownerId: string, pairKey: string): string {
  return createHmac("sha256", key).update(`${ownerId}|${pairKey}`).digest("hex");
}

/** The key under which a pair is stored for an owner (hex, 64 chars). */
export function routeCacheKey(ownerId: string, pairKey: string): string {
  return hmacHex(deriveKey(), ownerId, pairKey);
}

function isValid(value: RouteTime): boolean {
  return (
    Number.isFinite(value.km) &&
    Number.isFinite(value.minutes) &&
    value.km >= 0 &&
    value.minutes >= 0
  );
}

function createCache(
  ownerId: string,
  secret: Buffer,
  known: Map<string, RouteTime>,
): DbTravelCache {
  const pending = new Map<string, RouteTime>();
  return {
    get: (pairKey) => known.get(hmacHex(secret, ownerId, pairKey)),
    set: (pairKey, value) => {
      if (!isValid(value)) return;
      const key = hmacHex(secret, ownerId, pairKey);
      const kept = { km: value.km, minutes: value.minutes };
      known.set(key, kept);
      pending.set(key, kept);
    },
    size: () => known.size,
    pending: () => [...pending].map(([key, value]) => ({ key, value })),
    markFlushed: (entries) => {
      for (const entry of entries) pending.delete(entry.key);
    },
  };
}

/**
 * PostgreSQL can hold NaN / Infinity, which the Prisma driver cannot read back:
 * the whole query fails. That is a corrupt cache, not a reason to stop planning:
 * it starts empty. Nothing is deleted (a transient database failure must not
 * wipe a healthy cache); the corrupt rows expire with RETENTION_DAYS.
 */
async function readFreshRows(ownerId: string, cutoff: Date): Promise<StoredRoute[]> {
  try {
    return await db.agendaRouteCache.findMany({
      where: { ownerId, fetchedAt: { gte: cutoff } },
    });
  } catch (error) {
    console.error("[agenda] route cache unreadable:", error instanceof Error ? error.name : typeof error);
    return [];
  }
}

/**
 * Loads the owner's cache. Rows fetched more than RETENTION_DAYS ago are deleted
 * (this owner's only) and never returned; corrupt rows are skipped.
 * Throws if the database fails or ENCRYPTION_KEY is missing: the caller decides.
 */
export async function loadRouteCache(ownerId: string, now: Date): Promise<DbTravelCache> {
  const secret = deriveKey();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  await db.agendaRouteCache.deleteMany({ where: { ownerId, fetchedAt: { lt: cutoff } } });
  const rows = await readFreshRows(ownerId, cutoff);
  const known = new Map<string, RouteTime>();
  for (const row of rows) {
    const value = { km: row.km, minutes: row.minutes };
    if (isValid(value)) known.set(row.pairKey, value);
  }
  return createCache(ownerId, secret, known);
}

/**
 * Writes the entries added since the last flush; returns how many rows were
 * created (rows already present are left alone). Pending entries are cleared
 * only on success.
 * Throws on a database failure: the caller decides whether losing the cache
 * matters; the entries stay pending so a later flush can retry.
 */
export async function flushRouteCache(
  ownerId: string,
  cache: DbTravelCache,
  now: Date,
): Promise<number> {
  const entries = cache.pending();
  if (entries.length === 0) return 0;
  const result = await db.agendaRouteCache.createMany({
    data: entries.map(({ key, value }) => ({
      ownerId,
      pairKey: key,
      km: value.km,
      minutes: value.minutes,
      fetchedAt: now,
    })),
    skipDuplicates: true,
  });
  cache.markFlushed(entries);
  return result.count;
}

/** A cache that lives for one calculation only: used when the stored cache cannot be read. */
export function createMemoryCache(): TravelCache {
  const known = new Map<string, RouteTime>();
  return {
    get: (pairKey) => known.get(pairKey),
    set: (pairKey, value) => {
      if (isValid(value)) known.set(pairKey, { km: value.km, minutes: value.minutes });
    },
    size: () => known.size,
  };
}
