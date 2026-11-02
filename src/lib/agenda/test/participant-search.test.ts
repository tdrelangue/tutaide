// Thomas, 2026-11-02: « Avec qui ? » is a search bar with group filters, not a list to scroll.
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { MAX_SUGGESTIONS, searchPersons } from "../participant-search";

const MESURES = { id: "g1" };
const ADHOC = { id: "g2" };
const persons = [
  { id: "1", fullName: "Jean Bonneau", group: MESURES },
  { id: "2", fullName: "Sarah Croche", group: ADHOC },
  { id: "3", fullName: "Élodie Bonnet", group: MESURES },
  { id: "4", fullName: "Paul Ochon", group: null },
];
const names = (r: { matches: readonly { fullName: string }[] }) => r.matches.map((p) => p.fullName);

describe("searchPersons", () => {
  it("finds a name from a few letters, in any order, without accents or capitals", () => {
    assert.deepEqual(names(searchPersons(persons, "bonneau jean")), ["Jean Bonneau"]);
    assert.deepEqual(names(searchPersons(persons, "JE BON")), ["Jean Bonneau"]);
    assert.deepEqual(names(searchPersons(persons, "elo")), ["Élodie Bonnet"]);
  });

  it("puts names starting with the typed letters first", () => {
    assert.deepEqual(names(searchPersons(persons, "bon")), ["Élodie Bonnet", "Jean Bonneau"]);
    assert.deepEqual(names(searchPersons(persons, "s")), ["Sarah Croche"]);
  });

  it("searches within one group, and lists the whole group when nothing is typed", () => {
    assert.deepEqual(names(searchPersons(persons, "", { groupId: "g1" })), ["Élodie Bonnet", "Jean Bonneau"]);
    assert.deepEqual(names(searchPersons(persons, "bon", { groupId: "g2" })), []);
  });

  it("leaves out the persons already chosen", () => {
    assert.deepEqual(names(searchPersons(persons, "bon", { exclude: new Set(["1"]) })), ["Élodie Bonnet"]);
  });

  it("shows a few suggestions and counts the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, fullName: `Personne ${String(i).padStart(2, "0")}` }));
    const result = searchPersons(many, "pers");
    assert.equal(result.matches.length, MAX_SUGGESTIONS);
    assert.equal(result.total, 20);
  });
});
