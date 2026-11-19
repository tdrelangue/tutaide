// Thomas, 2026-11-04: the hospitals and courts of the Corrèze, from the official lists; hospital visiting hours.
import { describe, expect, it } from "vitest";
import { findHospital, mentionsHospital, searchEstablishments } from "../establishments";
import { HOPITAUX_CORREZE, TRIBUNAUX } from "../establishments-list";
import { withKnown } from "../geocode";

const names = (q: string) => searchEstablishments(q).map((e) => e.name);

describe("known hospitals and courts", () => {
  it("are found by what people type", () => {
    expect(names("hopital tulle")).toContain("Centre hospitalier Cœur de Corrèze");
    expect(names("hôpital d'Ussel")).toEqual(["Centre hospitalier d'Ussel"]);
    expect(names("tribunal brive")[0]).toBe("Tribunal judiciaire de Brive-la-Gaillarde");
    expect(names("juge des tutelles Tulle")).toEqual(["Tribunal judiciaire de Tulle"]);
    expect(names("clinique des cèdres")).toContain("Clinique les Cèdres");
    expect(names("12 rue de la Paix")).toEqual([]);
  });

  it("come first in the address search, even when the IGN fails, with their name in the address", () => {
    const failed = withKnown("tribunal tulle", { ok: false, error: "panne" });
    expect(failed.ok && failed.results[0]).toMatchObject({ label: "Tribunal judiciaire de Tulle, 9 Quai Gabriel Péri 19000 Tulle", named: "TRIBUNAL", precision: "housenumber" });
    const ign = { label: "Tribunal Judiciaire de Tulle, 19000 Tulle", lat: 45.26559, lon: 1.77057, precision: "housenumber" as const, score: 0.4, postcode: "19000", named: "TRIBUNAL" as const };
    const merged = withKnown("tribunal tulle", { ok: true, results: [ign] });
    expect(merged.ok && merged.results.map((r) => r.label)).toEqual(["Tribunal judiciaire de Tulle, 9 Quai Gabriel Péri 19000 Tulle"]);
    const other = withKnown("8 avenue du Chateau", { ok: true, results: [ign] });
    expect(other.ok && other.results).toEqual([ign]);
  });

  it("a hospital is recognised by its name, its building, or the word", () => {
    expect(findHospital("Centre hospitalier d'Ussel, 2 Avenue du Docteur Roullet 19200 Ussel", null)?.id).toBe("190000091");
    expect(findHospital("2 Avenue du Docteur Roullet 19200 Ussel", { lat: 45.54422, lon: 2.31274 })?.id).toBe("190000091");
    expect(findHospital("2 rue Victor Hugo 19200 Ussel", { lat: 45.548, lon: 2.31 })).toBeNull();
    expect(mentionsHospital("Clinique du Parc, 19100 Brive")).toBe(true);
    expect(mentionsHospital("12 ch des Prés 19000 Tulle")).toBe(false);
  });

  it("every entry is in or next to the Corrèze, with a point", () => {
    for (const e of [...HOPITAUX_CORREZE, ...TRIBUNAUX]) {
      expect(e.lat).toBeGreaterThan(44.9);
      expect(e.lat).toBeLessThan(45.9);
      expect(e.lon).toBeGreaterThan(1.2);
      expect(e.lon).toBeLessThan(2.6);
    }
  });
});