import { describe, expect, it } from "vitest";
import { VISIO } from "../../agenda-engine/domain";
import type { ValidatedItem } from "../../agenda-engine/domain";
import { itemRow as toItemRow, mapItems } from "../bridge/map/items";
import { unseal, unsealPoint } from "../sealed";
import { day, itemRow } from "./map-fixtures";

const withParts = (over: Parameters<typeof itemRow>[0] = {}, ids: string[] = []) => ({
  ...itemRow(over),
  participants: ids.map((contactId) => ({ contactId })),
});

const VALIDATED: ValidatedItem = {
  id: "c1@2026-11-03",
  apptId: null,
  kind: "VISIT",
  title: "Visite Jean",
  participants: ["c1"],
  personId: "c1",
  place: { id: "item:c1@2026-11-03", label: "Domicile", address: "3 rue du Port", lat: 48.2, lon: -1.7 },
  dur: 60,
  date: "2026-11-03",
  start: 600,
  end: 660,
  priority: "NORMAL",
  earliest: "2026-11-01",
  latest: "2026-11-10",
  fixed: false,
  movable: true,
  moved: false,
};

describe("mapItems validated", () => {
  it("maps a validated visit with a place snapshot", () => {
    const { validated, past, issues } = mapItems([withParts({}, ["c1"])]);
    expect(issues).toEqual([]);
    expect(past).toEqual([]);
    expect(validated).toEqual([VALIDATED]);
  });

  it("maps an appointment item", () => {
    const row = withParts(
      { itemKey: "ap1", kind: "APPT", appointmentId: "ap1", contactId: null, fixed: true, movable: false, moved: true },
      ["c1", "c2"],
    );
    expect(mapItems([row]).validated[0]).toMatchObject({
      id: "ap1",
      apptId: "ap1",
      kind: "APPT",
      personId: null,
      participants: ["c1", "c2"],
      fixed: true,
      movable: false,
      moved: true,
    });
  });

  it("uses the engine VISIO for a remote item", () => {
    const row = withParts({ placeRemote: true, placePoint: null, placeAddress: "" });
    expect(mapItems([row]).validated[0]?.place).toEqual(VISIO);
  });

  it("marks a place erased with its contact, with no travel", () => {
    const row = withParts({ placePoint: null, placeAddress: "", placeLabel: "Domicile" });
    expect(mapItems([row]).validated[0]?.place).toEqual({
      ...VISIO,
      id: "item:c1@2026-11-03",
      label: "Lieu supprimé",
    });
  });

  it("reads an empty sealed address as empty text", () => {
    const row = withParts({ placeAddress: "" });
    expect(mapItems([row]).validated[0]?.place.address).toBe("");
  });

  it("throws on an unreadable address or point", () => {
    expect(() => mapItems([withParts({ placeAddress: "plain" })])).toThrow();
    expect(() => mapItems([withParts({ placePoint: "plain" })])).toThrow();
  });
});

describe("mapItems past and cancelled", () => {
  it("maps MISSED to a not-held past item and strips the status prefix of the key", () => {
    const row = withParts({ status: "MISSED", itemKey: "MISSED:c1@2026-11-03" }, ["c1"]);
    const { validated, past } = mapItems([row]);
    expect(validated).toEqual([]);
    expect(past).toEqual([
      {
        id: "c1@2026-11-03",
        apptId: null,
        held: false,
        kind: "VISIT",
        title: "Visite Jean",
        participants: ["c1"],
        date: "2026-11-03",
        start: 600,
        end: 660,
      },
    ]);
  });

  it("keeps an unprefixed key as is", () => {
    const row = withParts({ status: "MISSED", itemKey: "c1@2026-11-03" });
    expect(mapItems([row]).past[0]?.id).toBe("c1@2026-11-03");
  });

  it("excludes CANCELLED items entirely", () => {
    const row = withParts({ status: "CANCELLED", itemKey: "CANCELLED:c1@2026-11-03" });
    expect(mapItems([row])).toEqual({ validated: [], past: [], issues: [] });
  });

  it("splits a mixed list", () => {
    const rows = [
      withParts({ id: "1", itemKey: "a" }),
      withParts({ id: "2", itemKey: "b", status: "MISSED" }),
      withParts({ id: "3", itemKey: "c", status: "CANCELLED" }),
    ];
    const r = mapItems(rows);
    expect(r.validated.map((v) => v.id)).toEqual(["a"]);
    expect(r.past.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("itemRow (engine to DB)", () => {
  it("builds an unchecked create input without participants", () => {
    const row = toItemRow(VALIDATED, "o1");
    expect(row).not.toHaveProperty("participants");
    expect(row).toMatchObject({
      ownerId: "o1",
      itemKey: "c1@2026-11-03",
      kind: "VISIT",
      appointmentId: null,
      contactId: "c1",
      title: "Visite Jean",
      placeLabel: "Domicile",
      placeRemote: false,
      startMin: 600,
      endMin: 660,
      priority: "NORMAL",
      fixed: false,
      movable: true,
      moved: false,
    });
    expect(row.date).toEqual(day("2026-11-03"));
    expect(row.earliestDate).toEqual(day("2026-11-01"));
    expect(row.latestDate).toEqual(day("2026-11-10"));
  });

  it("seals the address and the point", () => {
    const row = toItemRow(VALIDATED, "o1");
    expect(row.placeAddress).not.toContain("rue du Port");
    expect(unseal(row.placeAddress)).toBe("3 rue du Port");
    expect(unsealPoint(row.placePoint ?? null)).toEqual({ lat: 48.2, lon: -1.7 });
  });

  it("stores an empty address as empty and a remote place without point", () => {
    const row = toItemRow({ ...VALIDATED, place: { ...VISIO, id: "x" } }, "o1");
    expect(row).toMatchObject({ placePoint: null, placeRemote: true });
    const blank = toItemRow({ ...VALIDATED, place: { ...VALIDATED.place, address: "" } }, "o1");
    expect(blank.placeAddress).toBe("");
  });

  it("round-trips through mapItems", () => {
    const row = toItemRow(VALIDATED, "o1");
    const back = mapItems([
      { ...itemRow(), ...row, participants: [{ contactId: "c1" }] },
    ]);
    expect(back.validated).toEqual([VALIDATED]);
  });
});
