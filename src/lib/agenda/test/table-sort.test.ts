// Thomas, 2026-11-03: sort by town (also a bare commune like « Soudeilles »), and by « Vu le » / « Prévu le ».
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { sortRows, type TableSort } from "../../../app/(app)/agenda/sort-header";

const row = (fullName: string, label: string | null, seen: string | null = null) => ({ fullName, address: label === null ? null : { label }, seen });
const rows = [
  row("Jean Bonneau", "Soudeilles", "2026-09-01"),
  row("Anne Onyme", "3 Rue X 19240 Allassac", null),
  row("Paul Ochon", "12 Avenue Y 19700 Seilhac", "2026-06-01"),
  row("Sans Adresse", null, "2026-10-01"),
];
const by = (key: TableSort["key"], direction: 1 | -1 = 1): TableSort => ({ key, direction, basis: "LAST_NAME" });

describe("table sort", () => {
  it("sorts by town, a bare commune at its letter, no address last", () => {
    assert.deepEqual(sortRows(rows, by("address")).map((r) => r.fullName), ["Anne Onyme", "Paul Ochon", "Jean Bonneau", "Sans Adresse"]);
  });

  it("« Vu le »: never seen first, then not seen for the longest", () => {
    const sorted = sortRows(rows, by("seen"), undefined, (r) => r.seen);
    assert.deepEqual(sorted.map((r) => r.fullName), ["Anne Onyme", "Paul Ochon", "Jean Bonneau", "Sans Adresse"]);
  });
});
