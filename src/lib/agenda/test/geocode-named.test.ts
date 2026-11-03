// Thomas, 2026-11-03: a lieu-dit, an EHPAD, a hospital or a court found by its name; a house number the base lacks is kept.
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { keepTypedNumber, mergeResults, parseNamedPlaces, type GeocodedAddress } from "../geocode";
import { findEhpad } from "../ehpad";

const poi = (name: string, category: string[], score: number, lon: number, lat: number, postcode = "19210", city = "Lubersac") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { name: [name], category, score, postcode: [postcode], city: [city] },
});

describe("places found by their name", () => {
  it("keeps EHPAD, hospitals, courts and lieux-dits, tagged, and leaves the rest out", () => {
    const places = parseNamedPlaces({
      features: [
        poi("EHPAD le Jardin de Bagatelle", ["maison de retraite", "zone d'activité ou d'intérêt"], 0.54, 1.397975, 45.440218),
        poi("Résidence du Parc", ["maison de retraite"], 0.5, 1.4, 45.44),
        poi("Centre Hospitalier Cœur de Corrèze", ["hôpital"], 0.43, 1.77, 45.28, "19000", "Tulle"),
        poi("Tribunal Judiciaire de Tulle", ["palais de justice"], 0.34, 1.77, 45.26, "19000", "Tulle"),
        poi("les Landes", ["lieu-dit non habité", "élément topographique ou forestier"], 0.85, 2.0, 45.4, "19300", "Soudeilles"),
        poi("Bureau d'Information Touristique", ["office de tourisme"], 0.9, 1.4, 45.44),
      ],
    });
    assert.deepEqual(places.map((p) => [p.named, p.label]), [
      ["EHPAD", "EHPAD le Jardin de Bagatelle, 19210 Lubersac"],
      ["EHPAD", "Résidence du Parc (EHPAD), 19210 Lubersac"],
      ["HOPITAL", "Centre Hospitalier Cœur de Corrèze, 19000 Tulle"],
      ["TRIBUNAL", "Tribunal Judiciaire de Tulle, 19000 Tulle"],
      ["LIEU_DIT", "les Landes, 19300 Soudeilles"],
    ]);
    assert.equal(places[4]?.precision, "locality", "a lieu-dit is not a building");
    assert.equal(places[0]?.precision, "housenumber");
  });

  it("an EHPAD picked by its name is recognised as one by the planner", () => {
    const [bagatelle] = parseNamedPlaces({ features: [poi("EHPAD le Jardin de Bagatelle", ["maison de retraite"], 0.54, 1.397975, 45.440218)] });
    assert.ok(bagatelle);
    assert.equal(findEhpad(bagatelle.label, bagatelle)?.name, "EHPAD le Jardin de Bagatelle");
  });
});

const street = (label: string, score: number): GeocodedAddress => ({ label, lat: 45.17, lon: 1.58, precision: "street", score, postcode: "19360" });

describe("results", () => {
  it("keeps the house number typed when only the street is known", () => {
    assert.equal(keepTypedNumber("19 rue Jacquard 19360 Malemort", street("Rue Jacquard 19360 Malemort", 0.78)).label, "19 Rue Jacquard 19360 Malemort");
    assert.equal(keepTypedNumber("rue Jacquard Malemort", street("Rue Jacquard 19360 Malemort", 0.78)).label, "Rue Jacquard 19360 Malemort");
    assert.equal(keepTypedNumber("12 bis rue X", street("Rue X 19000 Tulle", 0.7)).label, "12 bis Rue X 19000 Tulle");
  });

  it("puts the best match first, addresses and named places together", () => {
    const landes = parseNamedPlaces({ features: [poi("les Landes", ["lieu-dit non habité"], 0.85, 2, 45.4, "19300", "Soudeilles")] });
    const merged = mergeResults("Les Landes 19300", [street("Les Landes 50360 Picauville", 0.59)], landes);
    assert.deepEqual(merged.map((m) => m.label), ["les Landes, 19300 Soudeilles", "Les Landes 50360 Picauville"]);
  });
});
