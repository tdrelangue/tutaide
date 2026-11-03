/**
 * Address search with the French public geocoder (IGN Géoplateforme, which
 * serves the Base Adresse Nationale). Free, no account, no key. Addresses are
 * sent to this State service only, never to Google (decision 2026-10-12).
 */

const DEFAULT_GEOCODER_URL = "https://data.geopf.fr/geocodage/search";

/** An override (tests, mirror) must still be HTTPS: addresses never travel in clear. */
function geocoderUrl(): string {
  const override = process.env.AGENDA_GEOCODER_URL;
  return override && override.startsWith("https://") ? override : DEFAULT_GEOCODER_URL;
}
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;

/** How exact the match is: only a house number gives a precise visit location. */
export type AddressPrecision = "housenumber" | "street" | "locality" | "municipality";

/** A named place found by its name (Thomas, 2026-11-03): shown with its own tag. */
export type NamedPlaceKind = "EHPAD" | "RESIDENCE" | "HOPITAL" | "TRIBUNAL" | "FOYER" | "MAIRIE" | "LIEU_DIT";

export const NAMED_PLACE_LABELS: Record<NamedPlaceKind, string> = {
  EHPAD: "EHPAD",
  RESIDENCE: "Résidence autonomie",
  HOPITAL: "Hôpital",
  TRIBUNAL: "Tribunal",
  FOYER: "Foyer, établissement",
  MAIRIE: "Mairie",
  LIEU_DIT: "Lieu-dit",
};

export type GeocodedAddress = {
  label: string;
  lat: number;
  lon: number;
  precision: AddressPrecision;
  /** Geocoder confidence, 0–1. */
  score: number;
  postcode: string | null;
  /** Set when found by its name (an EHPAD, a hospital, a lieu-dit…), not by its street. */
  named?: NamedPlaceKind;
};

const PRECISIONS = new Set<string>(["housenumber", "street", "locality", "municipality"]);

export const PRECISION_LABELS: Record<AddressPrecision, string> = {
  housenumber: "Adresse exacte",
  street: "Rue seulement",
  locality: "Lieu-dit seulement",
  municipality: "Commune seulement",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAddress(feature: unknown): GeocodedAddress | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) return null;
  const { label, score, type, postcode } = feature.properties;
  const coordinates = feature.geometry.coordinates;
  if (typeof label !== "string" || typeof type !== "string" || !PRECISIONS.has(type)) return null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  return {
    label,
    lat,
    lon,
    precision: type as AddressPrecision, // checked against PRECISIONS above
    score: typeof score === "number" ? score : 0,
    postcode: typeof postcode === "string" ? postcode : null,
  };
}

/** GeoJSON FeatureCollection from the geocoder -> usable addresses (pure). */
export function parseGeocoderResponse(body: unknown): GeocodedAddress[] {
  if (!isRecord(body) || !Array.isArray(body.features)) return [];
  return body.features
    .map(toAddress)
    .filter((a): a is GeocodedAddress => a !== null)
    .slice(0, MAX_RESULTS);
}

/** The points of interest worth a visit, by the IGN category (BD TOPO); everything else is left out. */
const NAMED_CATEGORIES: ReadonlyArray<readonly [string, NamedPlaceKind]> = [
  ["maison de retraite", "EHPAD"],
  ["résidence autonomie", "RESIDENCE"],
  ["hôpital", "HOPITAL"],
  ["etablissement hospitalier", "HOPITAL"],
  ["établissement hospitalier", "HOPITAL"],
  ["clinique", "HOPITAL"],
  ["palais de justice", "TRIBUNAL"],
  ["structure d'accueil pour personnes handicapées", "FOYER"],
  ["mairie", "MAIRIE"],
  ["lieu-dit habité", "LIEU_DIT"],
  ["lieu-dit non habité", "LIEU_DIT"],
];

function firstText(value: unknown): string | null {
  if (typeof value === "string") return value;
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function namedKind(category: unknown): NamedPlaceKind | null {
  const list = Array.isArray(category) ? category.filter((c): c is string => typeof c === "string") : [];
  return NAMED_CATEGORIES.find(([name]) => list.includes(name))?.[1] ?? null;
}

/** "EHPAD le Jardin de Bagatelle, 19210 Lubersac": an EHPAD always says so, the planner reads it. */
function namedLabel(kind: NamedPlaceKind, name: string, postcode: string | null, city: string | null): string {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tagged = kind === "EHPAD" && !plain.includes("ehpad") && !plain.includes("maison de retraite") ? `${name} (EHPAD)` : name;
  const where = [postcode, city].filter((p): p is string => p !== null).join(" ");
  return where === "" ? tagged : `${tagged}, ${where}`;
}

function toNamedPlace(feature: unknown): GeocodedAddress | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) return null;
  const { name, category, score, postcode, city } = feature.properties;
  const kind = namedKind(category);
  const title = firstText(name);
  const coordinates = feature.geometry.coordinates;
  if (kind === null || title === null || !Array.isArray(coordinates)) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  const code = firstText(postcode);
  return {
    label: namedLabel(kind, title, code, firstText(city)),
    lat,
    lon,
    // An establishment's point is its building; a lieu-dit's is only the hamlet.
    precision: kind === "LIEU_DIT" ? "locality" : "housenumber",
    score: typeof score === "number" ? score : 0,
    postcode: code,
    named: kind,
  };
}

/** Points of interest of the IGN (index « poi »), the useful ones only (pure). */
export function parseNamedPlaces(body: unknown): GeocodedAddress[] {
  if (!isRecord(body) || !Array.isArray(body.features)) return [];
  return body.features.map(toNamedPlace).filter((a): a is GeocodedAddress => a !== null);
}

/**
 * « 19 rue Jacquard » when the base only knows the street: the typed number is
 * kept in the label (the trip still goes to the street), not silently dropped.
 */
export function keepTypedNumber(query: string, address: GeocodedAddress): GeocodedAddress {
  const typed = query.trim().match(/^(\d+\s?(?:bis|ter)?)(?=\s)/i)?.[1];
  if (!typed || address.precision !== "street" || /^\d/.test(address.label)) return address;
  return { ...address, label: `${typed} ${address.label}` };
}

/** Addresses and named places together, best first, no place twice. */
export function mergeResults(query: string, addresses: readonly GeocodedAddress[], named: readonly GeocodedAddress[]): GeocodedAddress[] {
  const seen = new Set<string>();
  return [...addresses.map((a) => keepTypedNumber(query, a)), ...named.slice(0, 3)]
    .sort((a, b) => b.score - a.score)
    .filter((a) => {
      const key = a.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESULTS + 1);
}

async function fetchIndex(q: string, index: "address" | "poi"): Promise<unknown> {
  const params = new URLSearchParams({ q, limit: String(MAX_RESULTS), index });
  const res = await fetch(`${geocoderUrl()}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

/**
 * The address book's search: streets and house numbers, plus the places known
 * by their name (EHPAD, hospital, court, lieu-dit). Named places are a bonus:
 * when that index fails, the addresses are still given.
 */
export async function searchPlaces(query: string): Promise<GeocodeResult> {
  const q = query.trim();
  if (q.length < 3) return { ok: false, error: "Saisissez au moins 3 caractères." };
  const [addresses, named] = await Promise.allSettled([fetchIndex(q, "address"), fetchIndex(q, "poi")]);
  if (addresses.status === "rejected") return searchAddress(q);
  const places = named.status === "fulfilled" ? parseNamedPlaces(named.value) : [];
  return { ok: true, results: mergeResults(q, parseGeocoderResponse(addresses.value), places) };
}

export type GeocodeResult = { ok: true; results: GeocodedAddress[] } | { ok: false; error: string };

export async function searchAddress(query: string): Promise<GeocodeResult> {
  const q = query.trim();
  if (q.length < 3) return { ok: false, error: "Saisissez au moins 3 caractères." };
  const params = new URLSearchParams({ q, limit: String(MAX_RESULTS) });
  try {
    const res = await fetch(`${geocoderUrl()}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: "Le service d'adresses de l'IGN ne répond pas. Réessayez dans un instant." };
    return { ok: true, results: parseGeocoderResponse(await res.json()) };
  } catch {
    return { ok: false, error: "Recherche d'adresse impossible : vérifiez votre connexion Internet." };
  }
}
