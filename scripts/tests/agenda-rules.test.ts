// Run: npx tsx scripts/tests/agenda-rules.test.ts
import assert from "node:assert/strict";
import {
  dossierGroupKey,
  formatDuration,
  formatFrequency,
  hasAgendaAccess,
  minutesToTime,
  personsFromDossiers,
  pickAgendaOwner,
  timeToMinutes,
} from "../../src/lib/agenda/rules";
import { parseGeocoderResponse } from "../../src/lib/agenda/geocode";
import { agendaPersonSchema, agendaSettingsSchema } from "../../src/lib/agenda/validation";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const day = (n: number) => new Date(2026, 0, n);

// --- access ----------------------------------------------------------------

check("access: only accounts granted the add-on (or the demo)", () => {
  assert.equal(hasAgendaAccess({ agendaGranted: false }, false), false);
  assert.equal(hasAgendaAccess({ agendaGranted: true }, false), true);
  assert.equal(hasAgendaAccess({ agendaGranted: false }, true), true);
});

check("owner: one MJPM opens directly, several must choose, none has no agenda", () => {
  assert.deepEqual(pickAgendaOwner(["a"]), { kind: "owner", ownerId: "a" });
  assert.deepEqual(pickAgendaOwner(["a", "b"]), { kind: "choose" });
  assert.deepEqual(pickAgendaOwner([]), { kind: "none" });
});

// --- persons from dossiers ---------------------------------------------------

check("dossiers of one person (shared groupId) give one person", () => {
  const rows = [
    { id: "d1", fullName: "Jeanne Martin", groupId: "g1", createdAt: day(2) },
    { id: "d2", fullName: "Jeanne MARTIN", groupId: "g1", createdAt: day(1) },
    { id: "d3", fullName: "Lucien Bernard", groupId: null, createdAt: day(1) },
  ];
  assert.deepEqual(personsFromDossiers(rows, new Set()), [
    { dossierGroupKey: "g1", fullName: "Jeanne MARTIN", dossierCount: 2 },
    { dossierGroupKey: "d3", fullName: "Lucien Bernard", dossierCount: 1 },
  ]);
});

check("persons already in the agenda are not proposed again", () => {
  const rows = [
    { id: "d1", fullName: "Jeanne Martin", groupId: "g1", createdAt: day(1) },
    { id: "d3", fullName: "Lucien Bernard", groupId: null, createdAt: day(1) },
  ];
  assert.deepEqual(personsFromDossiers(rows, new Set(["g1", "d3"])), []);
});

check("group key: groupId, else the dossier itself", () => {
  assert.equal(dossierGroupKey({ id: "d1", groupId: "g" }), "g");
  assert.equal(dossierGroupKey({ id: "d1", groupId: null }), "d1");
});

// --- formatting -------------------------------------------------------------

check("frequency and duration labels", () => {
  assert.equal(formatFrequency(1, "QUARTER"), "1 visite par trimestre");
  assert.equal(formatFrequency(2, "MONTH"), "2 visites par mois");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(90), "1 h 30");
});

check("time input conversions", () => {
  assert.equal(minutesToTime(540), "09:00");
  assert.equal(timeToMinutes("17:30"), 1050);
  assert.equal(timeToMinutes("25:00"), null);
  assert.equal(timeToMinutes(""), null);
});

// --- geocoder ----------------------------------------------------------------

check("geocoder: GeoJSON features become addresses with precision", () => {
  const body = {
    type: "FeatureCollection",
    features: [
      { geometry: { coordinates: [3.063804, 50.640769] }, properties: { label: "12 Rue de la Monnaie 59800 Lille", score: 0.98, type: "housenumber" } },
      { geometry: { coordinates: [3.06, 50.63] }, properties: { label: "Lille", score: 0.5, type: "municipality" } },
    ],
  };
  assert.deepEqual(parseGeocoderResponse(body), [
    { label: "12 Rue de la Monnaie 59800 Lille", lat: 50.640769, lon: 3.063804, precision: "housenumber", score: 0.98 },
    { label: "Lille", lat: 50.63, lon: 3.06, precision: "municipality", score: 0.5 },
  ]);
});

check("geocoder: malformed or unknown features are dropped, never thrown", () => {
  assert.deepEqual(parseGeocoderResponse(null), []);
  assert.deepEqual(parseGeocoderResponse({ features: "x" }), []);
  assert.deepEqual(
    parseGeocoderResponse({ features: [{ geometry: { coordinates: ["a", 1] }, properties: { label: "x", type: "housenumber" } }, { properties: { label: "y", type: "poi" }, geometry: { coordinates: [1, 2] } }] }),
    []
  );
});

// --- validation ----------------------------------------------------------------

const person = {
  fullName: "Jeanne Martin",
  address: null,
  visitsPerPeriod: 1,
  visitPeriod: "QUARTER",
  visitMinutes: null,
  notes: null,
  status: "ACTIVE",
  endReason: null,
};

check("person: an ended measure needs a reason", () => {
  assert.equal(agendaPersonSchema.safeParse({ ...person, status: "ENDED" }).success, false);
  assert.equal(agendaPersonSchema.safeParse({ ...person, status: "ENDED", endReason: "DECES" }).success, true);
});

check("person: an address must come with coordinates", () => {
  assert.equal(agendaPersonSchema.safeParse({ ...person, address: { label: "12 rue X, Lille" } }).success, false);
  const ok = { label: "12 rue X, Lille", lat: 50.6, lon: 3.06, precision: "housenumber" };
  assert.equal(agendaPersonSchema.safeParse({ ...person, address: ok }).success, true);
});

const settings = {
  home: null,
  office: null,
  workDays: [1],
  dayStartMinutes: 540,
  dayEndMinutes: 1080,
  dayEndLimitMinutes: 1140,
  defaultVisitMinutes: 60,
};

check("settings: at least one work day and an hour-long day", () => {
  assert.equal(agendaSettingsSchema.safeParse(settings).success, true);
  assert.equal(agendaSettingsSchema.safeParse({ ...settings, workDays: [] }).success, false);
  assert.equal(agendaSettingsSchema.safeParse({ ...settings, dayEndMinutes: 560 }).success, false);
});

check("settings: the strict limit is never before the wished end", () => {
  assert.equal(agendaSettingsSchema.safeParse({ ...settings, dayEndLimitMinutes: 1080 }).success, true);
  assert.equal(agendaSettingsSchema.safeParse({ ...settings, dayEndLimitMinutes: null }).success, true);
  assert.equal(agendaSettingsSchema.safeParse({ ...settings, dayEndLimitMinutes: 1050 }).success, false);
});

console.log(`\n${passed} checks passed`);
