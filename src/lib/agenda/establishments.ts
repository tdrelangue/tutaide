/**
 * Hospitals and courts known by name (Thomas, 2026-11-04). Pure: found in the
 * address search without asking the IGN, and recognised in an address so
 * that a hospital stay gets hospital visiting hours.
 */
import { HOPITAUX_CORREZE, TRIBUNAUX, type Establishment } from "./establishments-list";

export type { Establishment };

/**
 * Visiting hours at the hospital, minutes after midnight (14:00–19:00):
 * mornings are for care and the doctors' rounds. A default, to refine.
 */
export const HOSPITAL_VISIT_FROM = 14 * 60;
export const HOSPITAL_VISIT_TO = 19 * 60;

/** Within this distance of a building-precise point, the address is that establishment. */
const NEAR_METRES = 60;
const ALL: readonly Establishment[] = [...HOPITAUX_CORREZE, ...TRIBUNAUX];

/** Lower case, no accents, words separated by single spaces, with spaces around. */
export function plainWords(text: string): string {
  const words = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "");
  return ` ${words.join(" ")} `;
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Its name written in the address (« Centre hospitalier d'Ussel, 2 avenue… »). */
function namedIn(e: Establishment, label: string): boolean {
  return plainWords(label).includes(plainWords(e.name));
}

/** The hospital at this address: its name in the label, else its building. Null otherwise. */
export function findHospital(label: string, point: { lat: number; lon: number } | null): Establishment | null {
  const byName = HOPITAUX_CORREZE.find((e) => namedIn(e, label));
  if (byName) return byName;
  if (!point) return null;
  return HOPITAUX_CORREZE.find((e) => e.precise && metres(e, point) <= NEAR_METRES) ?? null;
}

const HOSPITAL_WORDS = [" hopital ", " centre hospitalier ", " chu ", " clinique ", " usld ", " ssr "];

/** « Hôpital », « clinique », « centre hospitalier »… written in the address. */
export function mentionsHospital(label: string): boolean {
  const text = plainWords(label);
  return HOSPITAL_WORDS.some((w) => text.includes(w));
}

const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "au", "aux", "et", "en"]);

/** Every word typed is in its name, other names or town (« hopital tulle », « tribunal brive »). */
function matches(e: Establishment, query: string): boolean {
  const haystack = plainWords([e.name, ...(e.aka ?? []), e.city, e.postcode].join(" "));
  const typed = plainWords(query).trim().split(" ").filter((w) => w.length > 1 && !SMALL_WORDS.has(w));
  return typed.length > 0 && typed.every((w) => haystack.includes(` ${w}`));
}

/** The known hospitals and courts that answer a search, best first (the shortest name). */
export function searchEstablishments(query: string, limit = 3): readonly Establishment[] {
  return ALL.filter((e) => matches(e, query))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}

/** « Centre hospitalier d'Ussel, 2 Avenue du Docteur Roullet 19200 Ussel »: the name stays in the address. */
export function establishmentLabel(e: Establishment): string {
  return `${e.name}, ${e.street} ${e.postcode} ${e.city}`;
}
