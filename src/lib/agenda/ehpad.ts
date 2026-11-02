/**
 * Is an address an EHPAD? Pure (used by the person form and the planner).
 * Residents are visited in the afternoon only — mornings are for care — and
 * the visits of one EHPAD are grouped (Thomas, 2026-11-02).
 */
import { EHPADS_CORREZE, type Ehpad } from "./ehpad-list";

export type { Ehpad };

/** Afternoon visiting hours of an EHPAD, minutes after midnight (14:00–17:30). */
export const EHPAD_VISIT_FROM = 14 * 60;
export const EHPAD_VISIT_TO = 17 * 60 + 30;

/** Within this distance of a building-precise EHPAD point, the address is that EHPAD. */
const NEAR_METRES = 60;
/** « EHPAD » written in the address: the closest one within this distance is the one. */
const MENTION_METRES = 3000;

const ABBREVIATIONS: Readonly<Record<string, string>> = {
  r: "rue", av: "avenue", ave: "avenue", bd: "boulevard", che: "chemin", ch: "chemin", pl: "place",
  rte: "route", imp: "impasse", all: "allee", st: "saint", ste: "sainte", dr: "docteur",
};
const STREET_TYPES = new Set(["rue", "avenue", "boulevard", "chemin", "place", "route", "impasse", "allee", "voie", "residence", "lieu", "dit"]);
const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et"]);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "")
    .map((w) => ABBREVIATIONS[w] ?? w);
}

/** "32 Grand'Rue" -> { number: "32", core: "grand" }: the street's own words, without type or articles. */
function streetParts(street: string): { number: string | null; core: string } {
  const all = words(street);
  const number = all[0] !== undefined && /^\d+$/.test(all[0]) ? all[0] : null;
  const core = all.filter((w) => !/^\d+$/.test(w) && !STREET_TYPES.has(w) && !SMALL_WORDS.has(w));
  return { number, core: core.join(" ") };
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Same postcode and street (and house number, when the EHPAD's is known). */
function sameStreet(ehpad: Ehpad, label: string): boolean {
  const text = ` ${words(label).filter((w) => !SMALL_WORDS.has(w)).join(" ")} `;
  if (!text.includes(` ${ehpad.postcode} `)) return false;
  const { number, core } = streetParts(ehpad.street);
  if (core === "" || !text.includes(` ${core} `)) return false;
  if (number === null) return true;
  const found = text.match(/ (\d+) /);
  return found === null || found[1] === number;
}

export function mentionsEhpad(label: string): boolean {
  const text = ` ${words(label).join(" ")} `;
  return text.includes(" ehpad ") || text.includes(" maison retraite ") || text.includes(" maison de retraite ");
}

/** The EHPAD at this address, or null. `point` is the geocoded address, when known. */
export function findEhpad(label: string, point: { lat: number; lon: number } | null): Ehpad | null {
  if (point) {
    const near = EHPADS_CORREZE.find((e) => e.precise && metres(e, point) <= NEAR_METRES);
    if (near) return near;
  }
  const byStreet = EHPADS_CORREZE.find((e) => sameStreet(e, label));
  if (byStreet) return byStreet;
  if (!point || !mentionsEhpad(label)) return null;
  const closest = [...EHPADS_CORREZE].sort((a, b) => metres(a, point) - metres(b, point))[0];
  return closest && metres(closest, point) <= MENTION_METRES ? closest : null;
}

/**
 * The person lives in an EHPAD: their own choice when they made one (the
 * checkbox), otherwise what the address says.
 */
export function livesInEhpad(choice: boolean | null, label: string | null, point: { lat: number; lon: number } | null): boolean {
  if (choice !== null) return choice;
  if (label === null) return false;
  return findEhpad(label, point) !== null || mentionsEhpad(label);
}
