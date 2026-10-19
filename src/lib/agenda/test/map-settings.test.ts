import { describe, expect, it } from "vitest";
import { mapSettings } from "../bridge/map/settings";
import { seal, sealPoint } from "../sealed";
import { POINT, settingsRow } from "./map-fixtures";

const HOME = { id: "home", label: "Domicile", address: "1 rue de la Paix", ...POINT };

describe("mapSettings", () => {
  it("maps a complete row", () => {
    const { value, issues } = mapSettings(settingsRow());
    expect(issues).toEqual([]);
    expect(value).toMatchObject({
      home: HOME,
      workDays: [1, 2, 3, 4, 5],
      dayStart: 510,
      dayEnd: 1080,
      dayEndLimit: 1140,
      lunch: [750, 810],
      visitMinutes: 60,
    });
  });

  it("rejects a row whose work days are all invalid with NO_WORK_DAYS", () => {
    const row = settingsRow({ workDays: [0, 8, 9] });
    const { value, issues } = mapSettings(row);
    expect(value).toBeNull();
    expect(issues).toEqual([{ kind: "settings", id: row.id, reason: "NO_WORK_DAYS" }]);
    expect(mapSettings(settingsRow({ workDays: [] })).value).toBeNull();
  });

  it("uses the home coordinates for the office when there is none", () => {
    const office = mapSettings(settingsRow()).value?.office;
    expect(office).toEqual({ ...HOME, id: "office", label: "Bureau" });
  });

  it("decrypts a real office", () => {
    const row = settingsRow({
      officeAddress: seal("10 av. du Palais"),
      officePoint: sealPoint({ lat: 48.5, lon: -1.9 }),
    });
    expect(mapSettings(row).value?.office).toEqual({
      id: "office",
      label: "Bureau",
      address: "10 av. du Palais",
      lat: 48.5,
      lon: -1.9,
    });
  });

  it("falls back to home when the office has an address but no point", () => {
    const row = settingsRow({ officeAddress: seal("10 av. du Palais") });
    expect(mapSettings(row).value?.office).toMatchObject({ id: "office", lat: POINT.lat });
  });

  it("reports NO_HOME and no value when the home point is missing", () => {
    const { value, issues } = mapSettings(settingsRow({ homePoint: null }));
    expect(value).toBeNull();
    expect(issues).toEqual([{ kind: "settings", id: "s1", reason: "NO_HOME" }]);
  });

  it("reports NO_HOME when there is no settings row at all", () => {
    const { value, issues } = mapSettings(null);
    expect(value).toBeNull();
    expect(issues.map((i) => i.reason)).toEqual(["NO_HOME"]);
  });

  it("accepts a home point without address (empty address)", () => {
    expect(mapSettings(settingsRow({ homeAddress: null })).value?.home.address).toBe("");
  });

  it("has no lunch unless both bounds are set", () => {
    expect(mapSettings(settingsRow({ lunchStartMin: null })).value?.lunch).toBeNull();
    expect(mapSettings(settingsRow({ lunchEndMin: null })).value?.lunch).toBeNull();
    expect(mapSettings(settingsRow({ lunchStartMin: null, lunchEndMin: null })).value?.lunch).toBeNull();
  });

  it("keeps a null strict limit", () => {
    expect(mapSettings(settingsRow({ dayEndLimitMin: null })).value?.dayEndLimit).toBeNull();
  });

  it("filters work days to valid unique ISO weekdays", () => {
    const row = settingsRow({ workDays: [1, 0, 8, 3, 3, 7, -2] });
    expect(mapSettings(row).value?.workDays).toEqual([1, 3, 7]);
  });

  it("throws, never reads as empty, when the home is unreadable", () => {
    expect(() => mapSettings(settingsRow({ homeAddress: "not-encrypted" }))).toThrow();
    expect(() => mapSettings(settingsRow({ homePoint: "garbage" }))).toThrow();
  });
});
