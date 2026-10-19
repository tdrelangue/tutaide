/**
 * Travel model for the planner from IGN road times. Every pair of places is
 * asked once and cached; when the service cannot answer (offline, error),
 * the straight-line estimate is used and the pair is reported as estimated,
 * so the interface can say « temps estimé ».
 */
import { PARKING_MIN, straightLineTravel } from "../domain";
import type { Place, TravelModel } from "../domain";
import type { TravelCache } from "./cache";
import { REQUEST_TIMEOUT_MS, httpsOr } from "./http";
import type { FetchLike } from "./http";
import {
  ROUTE_URL,
  isRouteTime,
  parseRouteResponse,
  routeUrl,
} from "./routing";
import type { RouteTime } from "./routing";

/** IGN's Géoplateforme refuses bursts (HTTP 429): few requests in flight, spaced out. */
const DEFAULT_CONCURRENCY = 2;
/** At most ~4.5 requests per second overall, under IGN's per-IP limit. */
const MIN_INTERVAL_MS = 220;
/** Waits before asking again a pair IGN answered « too many requests ». */
const RETRY_DELAYS_MS: readonly number[] = [1000, 2000];
const TOO_MANY_REQUESTS = 429;
/** After this many failures in a row the service is taken as down: the rest is estimated at once. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** About one metre: two places closer than this are the same building. */
const COORD_DECIMALS = 5;

export interface MatrixDeps {
  readonly fetch: FetchLike;
  readonly cache: TravelCache;
  readonly concurrency?: number;
  /** Mirror or test endpoint; ignored unless HTTPS. */
  readonly url?: string;
  /** Injected in tests: waiting and the clock. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  /** Minimum gap between two request starts (default MIN_INTERVAL_MS; 0 in tests with a fake service). */
  readonly minIntervalMs?: number;
}

export interface TravelMatrix {
  readonly model: TravelModel;
  /** Pairs (see `pairKey`) computed offline: show them as estimates. */
  readonly estimated: readonly string[];
}

function coordKey(p: Place): string {
  // `+ 0` turns -0 into 0 so both signs give the same key.
  const fix = (x: number) =>
    (Number(x.toFixed(COORD_DECIMALS)) + 0).toFixed(COORD_DECIMALS);
  return `${fix(p.lat)},${fix(p.lon)}`;
}

/** Same key in both directions: road times are taken as symmetric. */
export function pairKey(a: Place, b: Place): string {
  return [coordKey(a), coordKey(b)].sort().join("|");
}

function uniquePairs(places: readonly Place[]): [Place, Place][] {
  const byCoord = new Map<string, Place>();
  for (const p of places) if (p.remote !== true) byCoord.set(coordKey(p), p);
  const list = [...byCoord.values()];
  return list.flatMap((a, i) =>
    list.slice(i + 1).map((b): [Place, Place] => [a, b]),
  );
}

/** A cache that fails (locked database…) behaves as empty: planning goes on with IGN or estimates. */
function safeGet(cache: TravelCache, key: string): RouteTime | undefined {
  try {
    const hit = cache.get(key);
    return isRouteTime(hit) ? hit : undefined;
  } catch {
    return undefined;
  }
}

function safeSet(cache: TravelCache, key: string, value: RouteTime): void {
  try {
    cache.set(key, value);
  } catch {
    // Not cached this time; it will be asked again next session.
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Spaces request starts at least MIN_INTERVAL_MS apart, across all workers. */
function makePacer(deps: MatrixDeps): () => Promise<void> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const interval = deps.minIntervalMs ?? MIN_INTERVAL_MS;
  let nextAt = 0;
  return async () => {
    const t = now();
    const wait = Math.max(0, nextAt - t);
    nextAt = Math.max(t, nextAt) + interval;
    if (wait > 0) await sleep(wait);
  };
}

type Attempt = RouteTime | null | "THROTTLED";

async function askOnce(a: Place, b: Place, deps: MatrixDeps): Promise<Attempt> {
  try {
    const res = await deps.fetch(routeUrl(a, b, httpsOr(deps.url, ROUTE_URL)), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === TOO_MANY_REQUESTS) return "THROTTLED";
    return res.ok ? parseRouteResponse(await res.json()) : null;
  } catch {
    return null;
  }
}

/** One pair: asked again after a pause while IGN says « too many requests ». */
async function fetchRoute(
  a: Place,
  b: Place,
  deps: MatrixDeps,
  pace: () => Promise<void>,
): Promise<RouteTime | null> {
  const sleep = deps.sleep ?? realSleep;
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await sleep(delay);
    await pace();
    const attempt = await askOnce(a, b, deps);
    if (attempt !== "THROTTLED") return attempt;
  }
  return null;
}

/** Fetches pairs, at most `limit` at a time and spaced out; stops asking once the service looks down. */
async function fetchAll(
  pairs: readonly [Place, Place][],
  deps: MatrixDeps,
): Promise<(RouteTime | null)[]> {
  const out: (RouteTime | null)[] = pairs.map(() => null);
  const limit = Math.floor(deps.concurrency ?? DEFAULT_CONCURRENCY);
  const pace = makePacer(deps);
  let next = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    for (
      let i = next++;
      i < pairs.length && failures < MAX_CONSECUTIVE_FAILURES;
      i = next++
    ) {
      const pair = pairs[i];
      if (!pair) continue;
      out[i] = await fetchRoute(pair[0], pair[1], deps, pace);
      failures = out[i] ? 0 : failures + 1;
    }
  };
  const workers =
    Number.isFinite(limit) && limit >= 1 ? limit : DEFAULT_CONCURRENCY;
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

function modelFrom(known: ReadonlyMap<string, RouteTime>): TravelModel {
  const remote = (a: Place, b: Place) => a.remote === true || b.remote === true;
  const same = (a: Place, b: Place) =>
    !remote(a, b) && coordKey(a) === coordKey(b);
  const lookup = (a: Place, b: Place) =>
    remote(a, b) ? undefined : known.get(pairKey(a, b));
  return {
    km: (a, b) =>
      same(a, b) ? 0 : (lookup(a, b)?.km ?? straightLineTravel.km(a, b)),
    minutes: (a, b) => {
      if (same(a, b)) return 0;
      const route = lookup(a, b);
      return route
        ? Math.round(route.minutes + PARKING_MIN)
        : straightLineTravel.minutes(a, b);
    },
  };
}

/**
 * Road times between all the places, from the cache or IGN; pairs IGN could
 * not answer are estimated and listed. Places not passed here are estimated too.
 */
export async function buildTravelModel(
  places: readonly Place[],
  deps: MatrixDeps,
): Promise<TravelMatrix> {
  const known = new Map<string, RouteTime>();
  const missing: [Place, Place][] = [];
  for (const [a, b] of uniquePairs(places)) {
    const hit = safeGet(deps.cache, pairKey(a, b));
    if (hit) known.set(pairKey(a, b), hit);
    else missing.push([a, b]);
  }
  const answers = await fetchAll(missing, deps);
  const estimated: string[] = [];
  missing.forEach(([a, b], i) => {
    const route = answers[i];
    if (!route) {
      estimated.push(pairKey(a, b));
      return;
    }
    known.set(pairKey(a, b), route);
    safeSet(deps.cache, pairKey(a, b), route);
  });
  return { model: modelFrom(known), estimated };
}
