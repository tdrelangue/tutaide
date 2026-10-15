/** Road distance and time by car from the IGN route service (Géoplateforme, BD TOPO). */
import type { Place } from "../domain";
import { isRecord } from "./http";

export const ROUTE_URL = "https://data.geopf.fr/navigation/itineraire";

export interface RouteTime {
  readonly km: number;
  /** Driving time, without parking. */
  readonly minutes: number;
}

// Maps, not objects: a unit such as "constructor" must not hit the prototype.
const TO_KM: ReadonlyMap<string, number> = new Map([
  ["kilometer", 1],
  ["meter", 0.001],
]);
const TO_MIN: ReadonlyMap<string, number> = new Map([
  ["minute", 1],
  ["second", 1 / 60],
]);

export function routeUrl(a: Place, b: Place, base = ROUTE_URL): string {
  const params = new URLSearchParams({
    resource: "bdtopo-osrm",
    profile: "car",
    optimization: "fastest",
    start: `${a.lon},${a.lat}`,
    end: `${b.lon},${b.lat}`,
    distanceUnit: "kilometer",
    timeUnit: "minute",
    getSteps: "false",
    getBbox: "false",
  });
  return `${base}?${params.toString()}`;
}

/** Route answer → km and minutes; null when anything is missing or odd (pure). */
export function parseRouteResponse(body: unknown): RouteTime | null {
  if (!isRecord(body)) return null;
  const { distance, duration, distanceUnit, timeUnit } = body;
  if (typeof distance !== "number" || typeof duration !== "number") return null;
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  const kmFactor =
    typeof distanceUnit === "string" ? TO_KM.get(distanceUnit) : undefined;
  const minFactor =
    typeof timeUnit === "string" ? TO_MIN.get(timeUnit) : undefined;
  if (
    kmFactor === undefined ||
    minFactor === undefined ||
    distance < 0 ||
    duration < 0
  )
    return null;
  return { km: distance * kmFactor, minutes: duration * minFactor };
}

/** A stored or received road time that can be trusted. */
export function isRouteTime(value: unknown): value is RouteTime {
  return (
    isRecord(value) &&
    typeof value.km === "number" &&
    typeof value.minutes === "number" &&
    Number.isFinite(value.km) &&
    Number.isFinite(value.minutes) &&
    value.km >= 0 &&
    value.minutes >= 0
  );
}
