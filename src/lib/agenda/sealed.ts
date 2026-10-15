import { decrypt, encrypt } from "@/lib/encryption";

/**
 * Agenda addresses and notes are stored encrypted (AES-256-GCM, decision D3,
 * 2026-10-15): notes may hold health information, addresses reveal homes.
 * The engine loads a whole agenda at once, so no database search is lost.
 */

export function seal(plain: string): string {
  return encrypt(plain);
}

export function sealOrNull(plain: string | null | undefined): string | null {
  return plain ? encrypt(plain) : null;
}

/**
 * Throws when a value cannot be decrypted (missing or wrong key, damaged row).
 * Never read it as empty: the page would show no address, and the next save
 * would erase the real one.
 */
export function unseal(stored: string | null): string | null {
  return stored === null || stored === "" ? null : decrypt(stored);
}

export type Point = { lat: number; lon: number };

/** Coordinates are sealed too: a name plus a readable point reveals the home to the metre. */
export function sealPoint(point: Point): string {
  return encrypt(`${point.lat},${point.lon}`);
}

/** Throws on an unreadable or malformed value, like unseal. */
export function unsealPoint(stored: string | null): Point | null {
  const plain = unseal(stored);
  if (plain === null) return null;
  const [lat, lon] = plain.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Malformed agenda point");
  return { lat, lon };
}
