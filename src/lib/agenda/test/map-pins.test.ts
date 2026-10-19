import { describe, expect, it } from "vitest";
import { VISIO } from "../../agenda-engine/domain";
import type { PinnedItem } from "../../agenda-engine/domain";
import { mapPins, pinRow as toPinRow } from "../bridge/map/pins";
import { unseal, unsealPoint } from "../sealed";
import { day, pinRow } from "./map-fixtures";

const PIN: PinnedItem = {
  id: "c1@2026-11-03",
  kind: "VISIT",
  apptId: null,
  personId: "c1",
  title: "Visite Jean",
  participants: ["c1"],
  place: { id: "item:c1@2026-11-03", label: "Domicile", address: "3 rue du Port", lat: 48.2, lon: -1.7 },
  dur: 60,
  priority: "NORMAL",
  date: "2026-11-04",
  start: 840,
};

describe("mapPins", () => {
  it("maps a pin", () => {
    const { values, issues } = mapPins([pinRow()], ["c1"]);
    expect(issues).toEqual([]);
    expect(values).toEqual([PIN]);
  });

  it("keeps only known participants and says so", () => {
    const { values, issues } = mapPins([pinRow({ participantIds: ["c1", "gone"] })], ["c1"]);
    expect(values[0]?.participants).toEqual(["c1"]);
    expect(issues).toEqual([{ kind: "pin", id: "pin1", reason: "PARTICIPANT_UNKNOWN" }]);
  });

  it("handles a pin without participants", () => {
    const { values, issues } = mapPins([pinRow({ participantIds: [] })], []);
    expect(values[0]?.participants).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("uses VISIO for a remote pin and marks an erased place", () => {
    const remote = mapPins([pinRow({ placeRemote: true, placePoint: null })], ["c1"]).values[0];
    expect(remote?.place).toEqual(VISIO);
    const erased = mapPins([pinRow({ placePoint: null })], ["c1"]).values[0];
    expect(erased?.place).toEqual({ ...VISIO, id: "item:c1@2026-11-03", label: "Lieu supprimé" });
  });

  it("maps appointment pins", () => {
    const row = pinRow({ kind: "APPT", appointmentId: "ap1", contactId: null, itemKey: "ap1" });
    expect(mapPins([row], ["c1"]).values[0]).toMatchObject({ id: "ap1", kind: "APPT", apptId: "ap1", personId: null });
  });

  it("throws on an unreadable address", () => {
    expect(() => mapPins([pinRow({ placeAddress: "plain" })], [])).toThrow();
  });
});

describe("pinRow (engine to DB)", () => {
  it("builds the create input with sealed place", () => {
    const row = toPinRow(PIN, "o1");
    expect(row).toMatchObject({
      ownerId: "o1",
      itemKey: "c1@2026-11-03",
      kind: "VISIT",
      appointmentId: null,
      contactId: "c1",
      title: "Visite Jean",
      participantIds: ["c1"],
      placeLabel: "Domicile",
      placeRemote: false,
      durationMin: 60,
      priority: "NORMAL",
      startMin: 840,
    });
    expect(row.date).toEqual(day("2026-11-04"));
    expect(unseal(row.placeAddress)).toBe("3 rue du Port");
    expect(unsealPoint(row.placePoint ?? null)).toEqual({ lat: 48.2, lon: -1.7 });
  });

  it("stores a remote pin without point", () => {
    const row = toPinRow({ ...PIN, place: VISIO }, "o1");
    expect(row.placePoint).toBeNull();
    expect(row.placeRemote).toBe(true);
  });

  it("does not share the participants array with the pin", () => {
    const row = toPinRow(PIN, "o1");
    expect(row.participantIds).toEqual(["c1"]);
    expect(row.participantIds).not.toBe(PIN.participants);
  });

  it("round-trips through mapPins", () => {
    const row = toPinRow(PIN, "o1");
    const back = mapPins([{ ...pinRow(), ...row }], ["c1"]);
    expect(back.values).toEqual([PIN]);
  });
});
