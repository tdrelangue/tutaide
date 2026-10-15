import type { RouteTime } from "./routing";

/** Where road times are kept between sessions (SQLite in the apps, memory in tests). */
export interface TravelCache {
  get(key: string): RouteTime | undefined;
  set(key: string, value: RouteTime): void;
  size(): number;
}

export function memoryCache(
  entries: Iterable<readonly [string, RouteTime]> = [],
): TravelCache {
  const map = new Map<string, RouteTime>(entries);
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    size: () => map.size,
  };
}
