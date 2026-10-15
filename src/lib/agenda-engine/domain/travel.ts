import type { Place, TravelModel } from "./model";

/** Straight line × 1.3 approximates the road network in rural France. */
export const ROAD_FACTOR = 1.3;
export const SPEED_KMH = 55;
/** Parking and walking to the door. */
export const PARKING_MIN = 6;
/** Below this, two places are the same building. */
const SAME_PLACE_KM = 0.05;
const EARTH_RADIUS_KM = 6371;

/** A video call: no travel, the tour stays where it is. */
export const VISIO: Place = {
  id: "visio",
  label: "Visio (à distance)",
  address: "À distance",
  lat: 0,
  lon: 0,
  remote: true,
};

export function haversineKm(a: Place, b: Place): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function roadKm(a: Place, b: Place): number {
  if (a.remote === true || b.remote === true) return 0;
  return haversineKm(a, b) * ROAD_FACTOR;
}

/**
 * Offline estimate, also the default model. The real road times (IGN) come
 * from ../geo (buildTravelModel) as a precomputed matrix with the same interface.
 */
export const straightLineTravel: TravelModel = {
  km: roadKm,
  minutes(a, b) {
    const km = roadKm(a, b);
    return km < SAME_PLACE_KM
      ? 0
      : Math.round((km / SPEED_KMH) * 60 + PARKING_MIN);
  },
};
