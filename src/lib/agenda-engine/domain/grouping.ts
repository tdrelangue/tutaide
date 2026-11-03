import type { Place } from "./model";
import type { Task } from "./planTypes";
import { haversineKm } from "./travel";

/**
 * Visits are grouped by city first, then by establishment (Thomas,
 * 2026-11-02): a day that already goes to a town draws that town's other
 * visits, and the residents of one EHPAD are seen on the same afternoon.
 * Opening a town far from every town of the day costs extra; two
 * neighbouring towns may still share a day when that saves a trip. Costs are
 * in km-equivalents, like the detour they add to.
 */
const SAME_CITY_BONUS = 12;
const SAME_SITE_BONUS = 20;
const FAR_CITY_COST = 15;
/** Towns closer than this (straight line) count as neighbours. */
const NEIGHBOUR_KM = 8;

/**
 * "19150 cornil" from "32 Grand'Rue 19150 Cornil": the postcode and the whole
 * town name ("19100 brive-la-gaillarde", "19360 saint-pantaleon-de-larche":
 * two « Saint-… » of one postcode stay apart). A bare town name (the geocoder
 * gives only that when it finds just the commune) is its own key. Null otherwise.
 */
export function cityKey(address: string): string | null {
  const plain = address
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const matches = [...plain.matchAll(/\b(\d{5})\s+([a-z][a-z' -]*)/g)];
  const last = matches.at(-1);
  const town = (name: string) => name.trim().replace(/[\s-]+/g, "-");
  if (last?.[2]) return `${last[1]} ${town(last[2])}`;
  return /^[a-z][a-z' -]*$/.test(plain.trim()) && plain.trim().length <= 60 ? town(plain) : null;
}

const cityOf = (place: Place) => (place.remote ? null : cityKey(place.address));

/** The day goes to other towns, all of them far from this one. */
function opensFarCity(task: Task, city: string, route: readonly Task[]): boolean {
  const others = route.filter((t) => cityOf(t.place) !== null);
  return (
    others.length > 0 &&
    !others.some((t) => cityOf(t.place) === city) &&
    others.every((t) => haversineKm(t.place, task.place) > NEIGHBOUR_KM)
  );
}

/** Same town, or a neighbouring one (Naves for Tulle): the people a day there should draw. */
export function sameArea(a: Place, b: Place): boolean {
  if (a.remote === true || b.remote === true) return false;
  const ka = cityKey(a.address);
  return (ka !== null && ka === cityKey(b.address)) || haversineKm(a, b) <= NEIGHBOUR_KM;
}

/** Cost of adding `task` to a day whose route is `route`: negative when the day already goes there. */
export function groupingCost(task: Task, route: readonly Task[]): number {
  const city = cityOf(task.place);
  if (city === null) return 0;
  const site = task.place.site;
  let cost = 0;
  if (route.some((t) => cityOf(t.place) === city)) cost -= SAME_CITY_BONUS;
  else if (opensFarCity(task, city, route)) cost += FAR_CITY_COST;
  if (site !== undefined && route.some((t) => t.place.site === site)) cost -= SAME_SITE_BONUS;
  return cost;
}
