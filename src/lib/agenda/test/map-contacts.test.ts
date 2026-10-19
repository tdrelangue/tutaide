import { describe, expect, it } from "vitest";
import { mapContact, mapContacts } from "../bridge/map/contacts";
import { mapFreePlaces } from "../bridge/map/places";
import { seal } from "../sealed";
import { availRow, contactRow, day, placeRow } from "./map-fixtures";

const TODAY = "2026-10-19";
const input = (
  over: Parameters<typeof contactRow>[0] = {},
  places = [placeRow()],
  avails: ReturnType<typeof availRow>[] = [],
) => ({ row: contactRow(over), places, avails });

describe("mapContact basics", () => {
  it("maps identity, places and status", () => {
    const { value, issues } = mapContact(input({ notBeforeMin: 600, status: "PAUSED" }), TODAY);
    expect(issues).toEqual([]);
    expect(value).toEqual({
      id: "c1",
      name: "Jean Bonneau",
      category: "PROTEGE",
      places: [{ id: "p1", label: "Domicile", address: "3 rue du Port", lat: 48.2, lon: -1.7 }],
      avail: null,
      notBefore: 600,
      status: "PAUSED",
      visits: null,
      prefDay: null,
    });
  });

  it("orders places by position, then id", () => {
    const places = [
      placeRow({ id: "b", position: 1, label: "B" }),
      placeRow({ id: "z", position: 0, label: "Z" }),
      placeRow({ id: "a", position: 0, label: "A" }),
    ];
    const ids = mapContact(input({}, places), TODAY).value?.places.map((p) => p.id);
    expect(ids).toEqual(["a", "z", "b"]);
  });

  it("skips a place without point and reports it with the place id", () => {
    const { value, issues } = mapContact(input({}, [placeRow({ point: "" })]), TODAY);
    expect(value?.places).toEqual([]);
    expect(issues).toEqual([{ kind: "contact", id: "p1", reason: "PLACE_NO_POINT" }]);
  });

  it("gives the contact NO place when the default address is unusable, never a secondary one", () => {
    const places = [placeRow({ id: "home", position: 0, point: "" }), placeRow({ id: "second", position: 1, label: "Seconde" })];
    const { value, issues } = mapContact(input({}, places), TODAY);
    expect(value?.places).toEqual([]);
    expect(issues).toEqual([{ kind: "contact", id: "home", reason: "PLACE_NO_POINT" }]);
  });

  it("keeps the default address when only a secondary one is unusable", () => {
    const places = [placeRow({ id: "home", position: 0 }), placeRow({ id: "second", position: 1, point: "" })];
    const { value, issues } = mapContact(input({}, places), TODAY);
    expect(value?.places.map((p) => p.id)).toEqual(["home"]);
    expect(issues).toEqual([{ kind: "contact", id: "second", reason: "PLACE_NO_POINT" }]);
  });

  it("throws on an unreadable place", () => {
    expect(() => mapContact(input({}, [placeRow({ address: "clear text" })]), TODAY)).toThrow();
  });

  it("empty address decrypts as empty string", () => {
    const row = placeRow({ address: "" });
    expect(mapContact(input({}, [row]), TODAY).value?.places[0]?.address).toBe("");
  });
});

describe("mapContact availability", () => {
  it("maps availability rows", () => {
    const avails = [availRow({ dows: [1, 2] }), availRow({ id: "a2", dows: [5], fromMin: 480, toMin: 600 })];
    expect(mapContact(input({}, [], avails), TODAY).value?.avail).toEqual([
      { dows: [1, 2], from: 1020, to: 1140 },
      { dows: [5], from: 480, to: 600 },
    ]);
  });

  it("drops invalid weekdays inside a row", () => {
    const avails = [availRow({ dows: [0, 2, 9, 2] })];
    expect(mapContact(input({}, [], avails), TODAY).value?.avail).toEqual([{ dows: [2], from: 1020, to: 1140 }]);
  });

  it("never turns all-invalid rows into 'always available'", () => {
    const avails = [availRow({ dows: [] }), availRow({ id: "a2", fromMin: 900, toMin: 900 })];
    const { value, issues } = mapContact(input({}, [], avails), TODAY);
    expect(value?.avail).toEqual([]);
    expect(issues.map((i) => i.reason)).toEqual(["BAD_AVAILABILITY", "BAD_AVAILABILITY"]);
  });
});

describe("mapContact visits", () => {
  const visits = { visitsPerPeriod: 1, visitPeriod: "MONTH" as const };

  it("maps a visit plan with its last visit", () => {
    const { value, issues } = mapContact(
      input({ ...visits, visitPriority: "HIGH", visitMin: 45, lastVisitOn: day("2026-09-20") }),
      TODAY,
    );
    expect(issues).toEqual([]);
    expect(value?.visits).toEqual({
      count: 1,
      period: "MONTH",
      lastVisit: "2026-09-20",
      priority: "HIGH",
      minutes: 45,
    });
  });

  it("defaults priority to NORMAL and minutes to null", () => {
    const v = mapContact(input({ ...visits, lastVisitOn: day("2026-09-20") }), TODAY).value?.visits;
    expect(v).toMatchObject({ priority: "NORMAL", minutes: null });
  });

  it("makes an unknown last visit due today and says so", () => {
    const { value, issues } = mapContact(input(visits), TODAY);
    // 1 per month = every 30 days (rounded): last visit 30 days ago.
    expect(value?.visits?.lastVisit).toBe("2026-09-19");
    expect(issues).toEqual([{ kind: "contact", id: "c1", reason: "LAST_VISIT_UNKNOWN" }]);
  });

  it("is due today whatever the rhythm", () => {
    const weekly = mapContact(input({ visitsPerPeriod: 2, visitPeriod: "WEEK" }), TODAY).value?.visits;
    expect(weekly?.lastVisit).toBe("2026-10-16");
  });

  it("has no visits when none is set, without issue", () => {
    const { value, issues } = mapContact(input(), TODAY);
    expect(value?.visits).toBeNull();
    expect(issues).toEqual([]);
  });

  it("reports a partially filled plan", () => {
    for (const over of [{ visitsPerPeriod: 1 }, { visitPeriod: "WEEK" as const }]) {
      const { value, issues } = mapContact(input(over), TODAY);
      expect(value?.visits).toBeNull();
      expect(issues).toEqual([{ kind: "contact", id: "c1", reason: "VISITS_INCOMPLETE" }]);
    }
  });

  it("reports an impossible plan (zero, or too many per period)", () => {
    for (const count of [0, -1, 8]) {
      const { value, issues } = mapContact(input({ visitsPerPeriod: count, visitPeriod: "WEEK" }), TODAY);
      expect(value?.visits).toBeNull();
      expect(issues.map((i) => i.reason)).toEqual(["VISITS_INVALID"]);
    }
  });
});

describe("mapContact preferred day", () => {
  it("builds the PREF_DAY rule", () => {
    const row = { prefDayDow: 2, prefDayStrength: "SOFT" as const };
    expect(mapContact(input(row), TODAY).value?.prefDay).toEqual({
      id: "pref:c1",
      type: "PREF_DAY",
      dow: 2,
      strength: "SOFT",
      label: "Jour préféré de Jean Bonneau",
    });
  });

  it("reports a half-filled or invalid preferred day", () => {
    for (const row of [
      { prefDayDow: 2 },
      { prefDayStrength: "SOFT" as const },
      { prefDayDow: 9, prefDayStrength: "SOFT" as const },
    ]) {
      const { value, issues } = mapContact(input(row), TODAY);
      expect(value?.prefDay).toBeNull();
      expect(issues.map((i) => i.reason)).toEqual(["PREF_DAY_INVALID"]);
    }
  });
});

describe("mapContacts", () => {
  it("groups places and availability per contact and ignores free places", () => {
    const rows = [contactRow({ id: "c1" }), contactRow({ id: "c2", fullName: "Anne" })];
    const places = [
      placeRow({ id: "p1", contactId: "c1" }),
      placeRow({ id: "p2", contactId: "c2" }),
      placeRow({ id: "free", contactId: null }),
    ];
    const avails = [availRow({ contactId: "c2" })];
    const { values, issues } = mapContacts(rows, places, avails, TODAY);
    expect(issues).toEqual([]);
    expect(values.map((c) => [c.id, c.places.map((p) => p.id), c.avail?.length ?? null])).toEqual([
      ["c1", ["p1"], null],
      ["c2", ["p2"], 1],
    ]);
  });

  it("collects issues of all contacts", () => {
    const rows = [contactRow({ id: "c1", visitsPerPeriod: 1 }), contactRow({ id: "c2", prefDayDow: 1 })];
    expect(mapContacts(rows, [], [], TODAY).issues.map((i) => i.id)).toEqual(["c1", "c2"]);
  });
});

describe("mapFreePlaces", () => {
  it("keeps only places without contact", () => {
    const rows = [
      placeRow({ id: "free", contactId: null, label: "Cabinet dentaire", address: seal("5 rue X") }),
      placeRow({ id: "p1" }),
    ];
    const { values, issues } = mapFreePlaces(rows);
    expect(issues).toEqual([]);
    expect(values).toEqual([{ id: "free", label: "Cabinet dentaire", address: "5 rue X", lat: 48.2, lon: -1.7 }]);
  });

  it("reports a free place without point", () => {
    const { values, issues } = mapFreePlaces([placeRow({ id: "free", contactId: null, point: "" })]);
    expect(values).toEqual([]);
    expect(issues).toEqual([{ kind: "place", id: "free", reason: "PLACE_NO_POINT" }]);
  });
});
