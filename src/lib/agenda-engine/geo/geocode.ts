/**
 * Address search with the French public geocoder (IGN Géoplateforme, which
 * serves the Base Adresse Nationale). Free, no account, no key. Addresses go
 * to this State service only (decision 2026-10-12). Ported from Tutellia.
 */
import { REQUEST_TIMEOUT_MS, httpsOr, isRecord } from "./http";
import type { FetchLike } from "./http";

export const GEOCODER_URL = "https://data.geopf.fr/geocodage/search";
const MAX_RESULTS = 5;
const MIN_QUERY = 3;

/** How exact the match is: only a house number gives a precise visit location. */
export type AddressPrecision =
  "housenumber" | "street" | "locality" | "municipality";

export interface GeocodedAddress {
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
  readonly precision: AddressPrecision;
  /** Geocoder confidence, 0–1. */
  readonly score: number;
}

const PRECISIONS: ReadonlySet<string> = new Set([
  "housenumber",
  "street",
  "locality",
  "municipality",
]);

export const PRECISION_LABELS: Readonly<Record<AddressPrecision, string>> = {
  housenumber: "Adresse exacte",
  street: "Rue seulement",
  locality: "Lieu-dit seulement",
  municipality: "Commune seulement",
};

function isPrecision(value: unknown): value is AddressPrecision {
  return typeof value === "string" && PRECISIONS.has(value);
}

function toAddress(feature: unknown): GeocodedAddress | null {
  if (
    !isRecord(feature) ||
    !isRecord(feature.properties) ||
    !isRecord(feature.geometry)
  )
    return null;
  const { label, score, type } = feature.properties;
  const coordinates: unknown = feature.geometry.coordinates;
  if (typeof label !== "string" || !isPrecision(type)) return null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon: unknown = coordinates[0];
  const lat: unknown = coordinates[1];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  return {
    label,
    lat,
    lon,
    precision: type,
    score: typeof score === "number" ? score : 0,
  };
}

/** GeoJSON FeatureCollection from the geocoder → usable addresses (pure). */
export function parseGeocoderResponse(body: unknown): GeocodedAddress[] {
  if (!isRecord(body) || !Array.isArray(body.features)) return [];
  const features: unknown[] = body.features;
  return features
    .map(toAddress)
    .filter((a): a is GeocodedAddress => a !== null)
    .slice(0, MAX_RESULTS);
}

export type GeocodeResult =
  | { readonly ok: true; readonly results: readonly GeocodedAddress[] }
  | { readonly ok: false; readonly error: string };

export interface GeocodeDeps {
  readonly fetch: FetchLike;
  /** Mirror or test endpoint; ignored unless HTTPS. */
  readonly url?: string;
}

export async function searchAddress(
  query: string,
  deps: GeocodeDeps,
): Promise<GeocodeResult> {
  const q = query.trim();
  if (q.length < MIN_QUERY)
    return { ok: false, error: "Saisissez au moins 3 caractères." };
  const params = new URLSearchParams({ q, limit: String(MAX_RESULTS) });
  try {
    const res = await deps.fetch(
      `${httpsOr(deps.url, GEOCODER_URL)}?${params.toString()}`,
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        error:
          "Le service d'adresses de l'IGN ne répond pas. Réessayez dans un instant.",
      };
    }
    return { ok: true, results: parseGeocoderResponse(await res.json()) };
  } catch {
    return {
      ok: false,
      error:
        "Recherche d'adresse impossible : vérifiez votre connexion Internet.",
    };
  }
}
