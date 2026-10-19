import { buildTasks, createContext } from "@/lib/agenda-engine/domain";
import type { IsoDate, Place, PlannerState } from "@/lib/agenda-engine/domain";
import { buildTravelModel } from "@/lib/agenda-engine/geo";
import type { FetchLike, TravelMatrix } from "@/lib/agenda-engine/geo";
import type { PlanDeps } from "./ops/plan";
import { createMemoryCache, flushRouteCache, loadRouteCache } from "./routeCache";
import type { DbTravelCache } from "./routeCache";

/**
 * The places one period can involve: home, office, everything to place or
 * already placed in it. Asking IGN for the whole address book instead would
 * mean thousands of pairs (80 places ≈ 3 160) for a single week.
 */
export function placesForPeriod(state: PlannerState, from: IsoDate, to: IsoDate): Place[] {
  const set = buildTasks(createContext(state), from, to, new Set());
  const places = [
    state.settings.home,
    state.settings.office,
    ...set.tasks.map((t) => t.place),
    ...set.fixed.map((t) => t.place),
    ...set.held.map((v) => v.place),
    ...state.pins.filter((p) => p.date >= from && p.date <= to).map((p) => p.place),
  ];
  return [...new Map(places.map((p) => [p.id, p])).values()];
}

/**
 * Road times for the period: from this MJPM's cache, otherwise asked to IGN
 * (French public service, HTTPS only), otherwise estimated and listed as such.
 * New road times are saved for next time.
 */
export async function travelFor(
  ownerId: string,
  state: PlannerState,
  period: { from: IsoDate; to: IsoDate },
  deps: PlanDeps,
): Promise<TravelMatrix> {
  const stored = await loadStoredCache(ownerId, deps.now);
  const cache = stored ?? createMemoryCache();
  const matrix = await buildTravelModel(placesForPeriod(state, period.from, period.to), { fetch: deps.fetch, cache });
  if (stored !== null) await saveStoredCache(ownerId, stored, deps.now);
  return matrix;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Only a cache: when it cannot be read, road times are asked again (and not saved) rather than stopping the planning. */
async function loadStoredCache(ownerId: string, now: Date): Promise<DbTravelCache | null> {
  try {
    return await loadRouteCache(ownerId, now);
  } catch (error) {
    console.error("[agenda] route cache not loaded:", errorName(error));
    return null;
  }
}

async function saveStoredCache(ownerId: string, cache: DbTravelCache, now: Date): Promise<void> {
  try {
    await flushRouteCache(ownerId, cache, now);
  } catch (error) {
    // The plan is right either way, the road times are asked again next time.
    console.error("[agenda] route cache not saved:", errorName(error));
  }
}
