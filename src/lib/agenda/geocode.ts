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

export type GeocodedAddress = {
  label: string;
  lat: number;
  lon: number;
  precision: AddressPrecision;
  /** Geocoder confidence, 0–1. */
  score: number;
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
  const { label, score, type } = feature.properties;
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
