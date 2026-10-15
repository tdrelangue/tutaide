import { describe, expect, it } from "vitest";
import type { Place } from "../../domain";
import { PARKING_MIN, VISIO, straightLineTravel } from "../../domain";
import {
  buildTravelModel,
  memoryCache,
  pairKey,
  parseGeocoderResponse,
  parseRouteResponse,
  routeUrl,
  searchAddress,
} from "../../geo";
import type { FetchLike } from "../../geo";

const BRIVE: Place = {
  id: "brive",
  label: "Brive",
  address: "Brive",
  lat: 45.1588,
  lon: 1.5321,
};
const TULLE: Place = {
  id: "tulle",
  label: "Tulle",
  address: "Tulle",
  lat: 45.2675,
  lon: 1.7716,
};
const OBJAT: Place = {
  id: "objat",
  label: "Objat",
  address: "Objat",
  lat: 45.2626,
  lon: 1.4083,
};

/** Real IGN answer for Brive → Tulle (14 October 2026), geometry removed. */
const IGN_ROUTE = {
  resource: "bdtopo-osrm",
  distanceUnit: "kilometer",
  timeUnit: "minute",
  distance: 28.7564,
  duration: 50.3833,
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) };
}

function fakeFetch(
  handler: (url: string) => unknown,
): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const f = (url: string) => {
    calls.push(url);
    try {
      return Promise.resolve(jsonResponse(handler(url)));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };
  return Object.assign(f, { calls });
}

describe("geocoding (IGN Géoplateforme)", () => {
  const feature = (type: string, extra: Record<string, unknown> = {}) => ({
    geometry: { coordinates: [1.533917, 45.160464] },
    properties: {
      label: "Place De La Halle 19100 Brive-la-Gaillarde",
      score: 0.87,
      type,
      ...extra,
    },
  });

  it("keeps usable addresses with their precision", () => {
    expect(parseGeocoderResponse({ features: [feature("street")] })).toEqual([
      {
        label: "Place De La Halle 19100 Brive-la-Gaillarde",
        lat: 45.160464,
        lon: 1.533917,
        precision: "street",
        score: 0.87,
      },
    ]);
  });

  it("drops malformed features and caps the list at five", () => {
    const bad = [
      {},
      { properties: {}, geometry: {} },
      feature("unknown"),
      { ...feature("street"), geometry: { coordinates: ["x", 1] } },
    ];
    expect(parseGeocoderResponse({ features: bad })).toEqual([]);
    expect(
      parseGeocoderResponse({
        features: Array.from({ length: 8 }, () => feature("housenumber")),
      }),
    ).toHaveLength(5);
    expect(parseGeocoderResponse(null)).toEqual([]);
    expect(
      parseGeocoderResponse({
        features: [feature("street", { score: "high" })],
      })[0]?.score,
    ).toBe(0);
  });

  it("asks for three characters at least", async () => {
    expect(
      await searchAddress(" ab ", { fetch: fakeFetch(() => ({})) }),
    ).toMatchObject({ ok: false });
  });

  it("queries the public geocoder over HTTPS only", async () => {
    const f = fakeFetch(() => ({ features: [feature("housenumber")] }));
    const res = await searchAddress("place de la halle brive", {
      fetch: f,
      url: "http://evil.example/search",
    });
    expect(res).toMatchObject({
      ok: true,
      results: [{ precision: "housenumber" }],
    });
    expect(f.calls[0]).toMatch(
      /^https:\/\/data\.geopf\.fr\/geocodage\/search\?q=place\+de\+la\+halle\+brive&limit=5$/,
    );
  });

  it("reports a service failure and an offline error in plain French", async () => {
    const down: FetchLike = () => Promise.resolve(jsonResponse({}, false));
    const downRes = await searchAddress("brive", { fetch: down });
    expect(!downRes.ok && downRes.error).toMatch(/IGN/);
    const offline: FetchLike = () => Promise.reject(new Error("offline"));
    const offRes = await searchAddress("brive", { fetch: offline });
    expect(!offRes.ok && offRes.error).toMatch(/connexion/);
  });
});

describe("road times (IGN itinéraire)", () => {
  it("builds the car route URL", () => {
    expect(routeUrl(BRIVE, TULLE)).toBe(
      "https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&start=1.5321%2C45.1588&end=1.7716%2C45.2675&distanceUnit=kilometer&timeUnit=minute&getSteps=false&getBbox=false",
    );
  });

  it("reads distance and duration, and rejects anything else", () => {
    expect(parseRouteResponse(IGN_ROUTE)).toEqual({
      km: 28.7564,
      minutes: 50.3833,
    });
    expect(
      parseRouteResponse({
        ...IGN_ROUTE,
        distanceUnit: "meter",
        distance: 28756.4,
      })?.km,
    ).toBeCloseTo(28.7564, 6);
    expect(
      parseRouteResponse({ ...IGN_ROUTE, timeUnit: "second", duration: 3023 })
        ?.minutes,
    ).toBeCloseTo(50.383, 2);
    expect(parseRouteResponse({ ...IGN_ROUTE, distance: "far" })).toBeNull();
    expect(
      parseRouteResponse({ ...IGN_ROUTE, distanceUnit: "mile" }),
    ).toBeNull();
    expect(parseRouteResponse({ ...IGN_ROUTE, timeUnit: "hour" })).toBeNull();
    expect(parseRouteResponse({ ...IGN_ROUTE, duration: -1 })).toBeNull();
    expect(parseRouteResponse("nope")).toBeNull();
  });

  it("keys a pair the same way in both directions", () => {
    expect(pairKey(BRIVE, TULLE)).toBe(pairKey(TULLE, BRIVE));
    expect(pairKey(BRIVE, { ...BRIVE, id: "other", lat: 45.158800001 })).toBe(
      pairKey(BRIVE, BRIVE),
    );
  });
});

describe("travel model from IGN, with cache and offline estimate", () => {
  it("fetches each pair once, adds parking time and fills the cache", async () => {
    const f = fakeFetch(() => IGN_ROUTE);
    const cache = memoryCache();
    const { model, estimated } = await buildTravelModel(
      [BRIVE, TULLE, OBJAT, BRIVE],
      { fetch: f, cache },
    );
    expect(f.calls).toHaveLength(3);
    expect(estimated).toEqual([]);
    expect(model.km(BRIVE, TULLE)).toBeCloseTo(28.7564, 4);
    expect(model.km(TULLE, BRIVE)).toBeCloseTo(28.7564, 4);
    expect(model.minutes(BRIVE, TULLE)).toBe(Math.round(50.3833 + PARKING_MIN));
    expect(cache.size()).toBe(3);

    const again = fakeFetch(() => IGN_ROUTE);
    await buildTravelModel([BRIVE, TULLE, OBJAT], { fetch: again, cache });
    expect(again.calls).toEqual([]);
  });

  it("counts no travel to a video call or within the same building", async () => {
    const { model } = await buildTravelModel([BRIVE, VISIO], {
      fetch: fakeFetch(() => IGN_ROUTE),
      cache: memoryCache(),
    });
    expect(model.km(BRIVE, VISIO)).toBe(0);
    expect(model.minutes(BRIVE, BRIVE)).toBe(0);
  });

  it("falls back to the straight-line estimate offline, says so, and caches nothing", async () => {
    const cache = memoryCache();
    const offline: FetchLike = () => Promise.reject(new Error("offline"));
    const { model, estimated } = await buildTravelModel([BRIVE, TULLE], {
      fetch: offline,
      cache,
    });
    expect(estimated).toEqual([pairKey(BRIVE, TULLE)]);
    expect(model.km(BRIVE, TULLE)).toBe(straightLineTravel.km(BRIVE, TULLE));
    expect(model.minutes(BRIVE, TULLE)).toBe(
      straightLineTravel.minutes(BRIVE, TULLE),
    );
    expect(cache.size()).toBe(0);
  });

  it("estimates pairs it was never asked about", async () => {
    const { model } = await buildTravelModel([BRIVE], {
      fetch: fakeFetch(() => IGN_ROUTE),
      cache: memoryCache(),
    });
    expect(model.km(BRIVE, OBJAT)).toBe(straightLineTravel.km(BRIVE, OBJAT));
  });

  it("estimates a pair whose answer is unreadable or refused", async () => {
    const f = fakeFetch((url) =>
      url.includes("1.7716") ? { nonsense: true } : IGN_ROUTE,
    );
    const { estimated } = await buildTravelModel([BRIVE, TULLE, OBJAT], {
      fetch: f,
      cache: memoryCache(),
    });
    expect(estimated).toHaveLength(2);
    const refused: FetchLike = () => Promise.resolve(jsonResponse({}, false));
    expect(
      (
        await buildTravelModel([BRIVE, TULLE], {
          fetch: refused,
          cache: memoryCache(),
        })
      ).estimated,
    ).toHaveLength(1);
  });

  it("limits the number of requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow: FetchLike = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return jsonResponse(IGN_ROUTE);
    };
    const places = Array.from({ length: 6 }, (_, i) => ({
      ...BRIVE,
      id: `p${i}`,
      lat: 45 + i / 10,
    }));
    await buildTravelModel(places, {
      fetch: slow,
      cache: memoryCache(),
      concurrency: 2,
    });
    expect(peak).toBe(2);
  });

  it("stops asking once the service looks down, and estimates the rest", async () => {
    let calls = 0;
    const down: FetchLike = () => {
      calls++;
      return Promise.reject(new Error("offline"));
    };
    const places = Array.from({ length: 8 }, (_, i) => ({
      ...BRIVE,
      id: `p${i}`,
      lat: 45 + i / 10,
    }));
    const { estimated } = await buildTravelModel(places, {
      fetch: down,
      cache: memoryCache(),
      concurrency: 1,
    });
    expect(calls).toBe(3);
    expect(estimated).toHaveLength(28);
  });

  it("sends coordinates over HTTPS only", async () => {
    const f = fakeFetch(() => IGN_ROUTE);
    await buildTravelModel([BRIVE, TULLE], {
      fetch: f,
      cache: memoryCache(),
      url: "http://example.org/route",
    });
    expect(f.calls[0]).toMatch(
      /^https:\/\/data\.geopf\.fr\/navigation\/itineraire\?/,
    );
  });

  it("survives a broken cache and ignores unreadable cached rows", async () => {
    const broken = {
      get: () => {
        throw new Error("database is locked");
      },
      set: () => {
        throw new Error("database is locked");
      },
      size: () => 0,
    };
    const res = await buildTravelModel([BRIVE, TULLE], {
      fetch: fakeFetch(() => IGN_ROUTE),
      cache: broken,
    });
    expect(res.estimated).toEqual([]);
    const bad = memoryCache([
      [pairKey(BRIVE, TULLE), { km: Number.NaN, minutes: 3 }],
    ]);
    const f = fakeFetch(() => IGN_ROUTE);
    const { model } = await buildTravelModel([BRIVE, TULLE], {
      fetch: f,
      cache: bad,
    });
    expect(f.calls).toHaveLength(1);
    expect(model.km(BRIVE, TULLE)).toBeCloseTo(28.7564, 4);
  });

  it("falls back to the default concurrency for a nonsense value", async () => {
    const f = fakeFetch(() => IGN_ROUTE);
    const { estimated } = await buildTravelModel([BRIVE, TULLE, OBJAT], {
      fetch: f,
      cache: memoryCache(),
      concurrency: Number.NaN,
    });
    expect(estimated).toEqual([]);
    expect(f.calls).toHaveLength(3);
  });
});

describe("hostile answers", () => {
  it("rejects prototype keys as units and non-finite numbers", () => {
    expect(
      parseRouteResponse({ ...IGN_ROUTE, distanceUnit: "constructor" }),
    ).toBeNull();
    expect(
      parseRouteResponse({ ...IGN_ROUTE, timeUnit: "__proto__" }),
    ).toBeNull();
    expect(
      parseRouteResponse({ ...IGN_ROUTE, distance: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(parseRouteResponse([28, 50])).toBeNull();
  });

  it("gives the same pair key on both sides of zero", () => {
    const a = { ...BRIVE, lat: -0.000001, lon: 0 };
    const b = { ...BRIVE, lat: 0, lon: 0 };
    expect(pairKey(a, TULLE)).toBe(pairKey(b, TULLE));
  });
});
