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

/** "19150 cornil" from "32 Grand'Rue 19150 Cornil"; null when the address has no postcode. */
export function cityKey(address: string): string | null {
  const plain = address
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const matches = [...plain.matchAll(/\b(\d{5})\s+([a-z]+)/g)];
  const last = matches.at(-1);
  return last ? `${last[1]} ${last[2]}` : null;
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
