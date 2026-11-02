// Import of a caseload file (Proxima « Adresses » export): reading, name matching,
// and the import itself on an in-memory PostgreSQL. Names are fictional.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { displayName, isSamePerson, normalizePhone, readContactRows, type FileContact } from "../contacts-file";
import { findImportConflicts, geocodeFromFile, importContactsFromFile, type Geocode } from "../contacts-import";
import * as service from "../service";
import { createTestDb, createUser } from "./db";

const HEADER = ["Entit�", "Mjpm", "NIR", "Civilité", "Nom usage", "Nom", "Prénom", "Date naiss.", "Date décès", "", "Adresse par défaut", "CP", "Ville", "Tél.", "Tél. autre"];

function row(values: Partial<Record<"usage" | "nom" | "prenom" | "deces" | "adresse" | "cp" | "ville" | "tel", string>>): string[] {
  return ["Service", "AB", "1 23 45 67 890 123 45", "M.", values.usage ?? "", values.nom ?? "", values.prenom ?? "", "01/01/1950", values.deces ?? "", "---  Domicile  ---", values.adresse ?? "", values.cp ?? "", values.ville ?? "", values.tel ?? "", "07 00 00 00 00"];
}

describe("readContactRows", () => {
  it("reads a Proxima export: street line, padded postcode, phone, usage name; skips the deceased", () => {
    const result = readContactRows([
      ["Export des adresses"],
      HEADER,
      row({ nom: "BONNEAU", prenom: "Jean", adresse: "Résidence Les Tilleuls\n12 rue des Lilas\n59100 ROUBAIX", cp: "59100", ville: "Roubaix", tel: "06-12-34-56-78" }),
      row({ usage: "DEUF", nom: "PROVISTE", prenom: "Anne", adresse: "Le Bourg", cp: "1000", ville: "Bourg-en-Bresse", tel: "NC." }),
      row({ nom: "TERIEUR", prenom: "Alain", deces: "02/03/2026" }),
      row({ nom: "", prenom: "" }),
    ]);
    assert.ok(result.ok);
    assert.equal(result.deceased, 1);
    assert.deepEqual(result.contacts, [
      { firstName: "Jean", lastName: "BONNEAU", usageName: null, address: "12 rue des Lilas 59100 Roubaix", phone: "06 12 34 56 78" },
      { firstName: "Anne", lastName: "PROVISTE", usageName: "DEUF", address: "Le Bourg 01000 Bourg-en-Bresse", phone: null },
    ]);
    // Only these five fields leave the browser: no NIR, no birth date.
    assert.equal(JSON.stringify(result.contacts).includes("1 23 45"), false);
  });

  it("refuses a file without Nom / Prénom columns", () => {
    const result = readContactRows([["Produit", "Prix"], ["Pomme", "2"]]);
    assert.equal(result.ok, false);
  });

  it("shows names as « Prénom Nom », not in capitals", () => {
    assert.equal(displayName({ firstName: "JEAN-MARC", lastName: "D'ALMEIDA", usageName: null, address: null, phone: null }), "Jean-Marc D'Almeida");
    assert.equal(displayName({ firstName: "Anne", lastName: "PROVISTE", usageName: "de Neuville", address: null, phone: null }), "Anne de Neuville");
  });

  it("normalizes phones", () => {
    assert.equal(normalizePhone("+33 6 12 34 56 78"), "06 12 34 56 78");
    assert.equal(normalizePhone("03.20.00.00.00 / 06 00 00 00 00"), "03 20 00 00 00");
    assert.equal(normalizePhone("inconnu"), null);
  });
});

describe("isSamePerson", () => {
  const jean: FileContact = { firstName: "Jean-Marc", lastName: "BONNEAU", usageName: null, address: null, phone: null };
  const anne: FileContact = { firstName: "Anne", lastName: "PROVISTE", usageName: "DEUF", address: null, phone: null };

  it("same words in any order, accents and case ignored", () => {
    assert.ok(isSamePerson("BONNEAU Jean Marc", jean));
    assert.ok(isSamePerson("jean-marc bonneau", jean));
  });
  it("usage name or birth name; part of the first names", () => {
    assert.ok(isSamePerson("Anne Deuf", anne));
    assert.ok(isSamePerson("Anne Proviste", anne));
    assert.ok(isSamePerson("Jean Bonneau", jean));
  });
  it("never on a last name alone or another first name", () => {
    assert.equal(isSamePerson("Bonneau", jean), false);
    assert.equal(isSamePerson("Paul Bonneau", jean), false);
    assert.equal(isSamePerson("Jean Marc", jean), false);
  });
});

describe("geocodeFromFile", () => {
  type Feature = { label: string; score: number; type: string; postcode?: string };
  /** The public address search, answering by query. */
  function stubSearch(answers: Record<string, Feature[]>) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const q = new URL(String(url)).searchParams.get("q") ?? "";
      const features = (answers[q] ?? []).map((p) => ({ properties: p, geometry: { coordinates: [3.17, 50.69] } }));
      return new Response(JSON.stringify({ features }));
    }) as typeof fetch; // test double with the one call shape searchAddress makes
    return () => { globalThis.fetch = original; };
  }

  it("keeps a match of the file's département, else falls back to the town", async () => {
    const restore = stubSearch({
      "12 rue des Lilas 59100 Roubaix": [{ label: "12 Rue des Lilas 59100 Roubaix", score: 0.9, type: "housenumber", postcode: "59100" }],
      "Foyer Les Ormes 59200 Tourcoing": [{ label: "Rue des Ormes 75012 Paris", score: 0.6, type: "street", postcode: "75012" }],
      "59200 Tourcoing": [{ label: "Tourcoing", score: 0.95, type: "municipality", postcode: "59200" }],
      "Mas perdu 13000 Marseille": [{ label: "Mas 13000 Marseille", score: 0.2, type: "street" }],
    });
    try {
      assert.equal((await geocodeFromFile("12 rue des Lilas 59100 Roubaix"))?.precision, "housenumber");
      assert.deepEqual(await geocodeFromFile("Foyer Les Ormes 59200 Tourcoing"), { label: "Tourcoing", lat: 50.69, lon: 3.17, precision: "municipality" });
      assert.equal(await geocodeFromFile("Mas perdu 13000 Marseille"), null);
      assert.equal(await geocodeFromFile("sans code postal"), null);
    } finally {
      restore();
    }
  });
});

describe("importContactsFromFile", () => {
  let client: PrismaClient;
  let close: () => Promise<void>;
  let owner: string;
  const queries: string[] = [];
  const geocode: Geocode = async (query) => {
    queries.push(query);
    if (query.startsWith("introuvable")) return null;
    const precision = query.startsWith("Le Bourg") ? "municipality" : "housenumber";
    return { label: `${query} (trouvé)`, lat: 50.69, lon: 3.17, precision };
  };
  const contact = (firstName: string, lastName: string, address: string | null, phone: string | null = null): FileContact =>
    ({ firstName, lastName, usageName: null, address, phone });

  beforeAll(async () => {
    ({ client, close } = await createTestDb());
    owner = await createUser(client, "mjpm@test.invalid");
    // Already in the agenda: one without address, one with an address typed by hand.
    await service.createAgendaPerson(owner, owner, { fullName: "Jean Bonneau", groupId: null, address: null, visitsPerPeriod: 1, visitPeriod: "MONTH", visitMinutes: null, visitEvery: 1, lastVisitOn: null, inEhpad: null, notes: null, phone: null, status: "ACTIVE", endReason: null });
    await service.createAgendaPerson(owner, owner, { fullName: "Sarah Croche", groupId: null, address: { label: "Adresse saisie", lat: 50, lon: 3, precision: "housenumber" }, visitsPerPeriod: 1, visitPeriod: "MONTH", visitMinutes: null, visitEvery: 1, lastVisitOn: null, inEhpad: null, notes: null, phone: "03 20 00 00 00", status: "ACTIVE", endReason: null });
    // In the dossiers only (APA + ASH of the same person).
    const apa = await client.dossier.create({ data: { fullName: "PROVISTE Anne", userId: owner, moduleType: "APA", groupId: "g-anne" } });
    await client.dossier.create({ data: { fullName: "PROVISTE Anne", userId: owner, moduleType: "ASH", groupId: apa.groupId } });
    // Two agenda persons with the same name.
    for (let i = 0; i < 2; i++) {
      await service.createAgendaPerson(owner, owner, { fullName: "Paul Ochon", groupId: null, address: null, visitsPerPeriod: 1, visitPeriod: "MONTH", visitMinutes: null, visitEvery: 1, lastVisitOn: null, inEhpad: null, notes: null, phone: null, status: "ACTIVE", endReason: null });
    }
  });
  afterAll(() => close());

  const file = [
    contact("Jean", "BONNEAU", "12 rue des Lilas 59100 Roubaix", "06 12 34 56 78"),
    contact("Sarah", "CROCHE", "1 place du Marché 59000 Lille", "06 99 99 99 99"),
    contact("Anne", "PROVISTE", "Le Bourg 01000 Bourg-en-Bresse"),
    contact("Paul", "OCHON", "3 rue Haute 59000 Lille"),
    contact("Alex", "TERIEUR", "introuvable 59000 Lille", "07 11 22 33 44"),
  ];

  it("completes, links to the dossiers, adds, and reports what to check", async () => {
    const report = await importContactsFromFile(owner, owner, file, new Set(), geocode);
    assert.deepEqual(report, {
      added: 2,
      completed: 1,
      replaced: 0,
      unchanged: 1,
      ambiguous: ["Paul Ochon"],
      addressNotFound: ["Alex Terieur"],
      imprecise: ["Anne Proviste"],
      addressKept: [],
    });
    // Sarah has an address: it is not searched again, nor replaced.
    assert.equal(queries.some((q) => q.includes("Marché")), false);

    const persons = await service.listAgendaPersons(owner);
    const byName = (name: string) => persons.find((p) => p.fullName === name);
    assert.equal(byName("Jean Bonneau")?.address?.label, "12 rue des Lilas 59100 Roubaix (trouvé)");
    assert.equal(byName("Jean Bonneau")?.phone, "06 12 34 56 78");
    assert.equal(byName("Sarah Croche")?.address?.label, "Adresse saisie");
    assert.equal(byName("Sarah Croche")?.phone, "03 20 00 00 00");
    assert.equal(byName("Anne Proviste")?.fromDossiers, true);
    assert.equal(byName("Alex Terieur")?.address, null);
    assert.equal(persons.length, 6);
  });

  it("the dossier import no longer offers the person, and the phone is encrypted at rest", async () => {
    assert.equal((await service.listImportablePersons(owner)).length, 0);
    const row = await client.agendaContact.findFirstOrThrow({ where: { ownerId: owner, fullName: "Alex Terieur" } });
    assert.ok(row.phone !== null && !row.phone.includes("07 11"));
  });

  it("importing the same file again adds nothing", async () => {
    const report = await importContactsFromFile(owner, owner, file, new Set(), geocode);
    assert.equal(report.added, 0);
    assert.equal((await service.listAgendaPersons(owner)).length, 6);
  });

  it("asks only about persons already in the agenda with another address or phone", async () => {
    const conflicts = await findImportConflicts(owner, file);
    // Jean now has the file's address (with « (trouvé) ») and phone: only Sarah differs.
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0], {
      index: 1,
      name: "Sarah Croche",
      current: { address: "Adresse saisie", phone: "03 20 00 00 00" },
      file: { address: "1 place du Marché 59000 Lille", phone: "06 99 99 99 99" },
    });
  });

  it("ignores case, accents and punctuation when comparing addresses", async () => {
    const same = [contact("Sarah", "CROCHE", "ADRESSE, saisie", "03.20.00.00.00")];
    assert.deepEqual(await findImportConflicts(owner, same), []);
  });

  it("replaces the address and phone of the persons chosen, and only theirs", async () => {
    const report = await importContactsFromFile(owner, owner, file, new Set([1]), geocode);
    assert.equal(report.replaced, 1);
    const sarah = (await service.listAgendaPersons(owner)).find((p) => p.fullName === "Sarah Croche");
    assert.equal(sarah?.address?.label, "1 place du Marché 59000 Lille (trouvé)");
    assert.equal(sarah?.phone, "06 99 99 99 99");
    assert.deepEqual(await findImportConflicts(owner, file), []);
  });

  it("keeps the old address when the file's cannot be found", async () => {
    const moved = [contact("Sarah", "CROCHE", "introuvable 59000 Lille", "06 99 99 99 99")];
    const report = await importContactsFromFile(owner, owner, moved, new Set([0]), geocode);
    assert.deepEqual(report.addressKept, ["Sarah Croche"]);
    const sarah = (await service.listAgendaPersons(owner)).find((p) => p.fullName === "Sarah Croche");
    assert.equal(sarah?.address?.label, "1 place du Marché 59000 Lille (trouvé)");
  });
});

describe("selection mode: many persons at once", () => {
  let client: PrismaClient;
  let close: () => Promise<void>;
  let owner: string;
  const person = (fullName: string) => ({ fullName, groupId: null, address: null, visitsPerPeriod: 1, visitPeriod: "MONTH" as const, visitMinutes: null, visitEvery: 1, lastVisitOn: null, inEhpad: null, notes: null, phone: null, status: "ACTIVE" as const, endReason: null });

  beforeAll(async () => {
    ({ client, close } = await createTestDb());
    owner = await createUser(client, "bulk@test.invalid");
    for (const name of ["Jean Bonneau", "Sarah Croche", "Paul Ochon"]) await service.createAgendaPerson(owner, owner, person(name));
  });
  afterAll(() => close());

  const idsOf = async (names: string[]) =>
    (await service.listAgendaPersons(owner)).filter((p) => names.includes(p.fullName)).map((p) => p.id);

  it("ends the measure of the selected persons, with the reason chosen", async () => {
    const count = await service.endAgendaPersons(owner, await idsOf(["Jean Bonneau", "Sarah Croche"]), "MAINLEVEE");
    assert.equal(count, 2);
    const persons = await service.listAgendaPersons(owner);
    assert.deepEqual(persons.filter((p) => p.status === "ENDED").map((p) => [p.fullName, p.endReason]), [["Jean Bonneau", "MAINLEVEE"], ["Sarah Croche", "MAINLEVEE"]]);
    // Already ended: left as it was.
    assert.equal(await service.endAgendaPersons(owner, await idsOf(["Jean Bonneau"]), "DECES"), 0);
  });

  it("removes the selected persons, never another owner's", async () => {
    const other = await createUser(client, "other@test.invalid");
    await service.createAgendaPerson(other, other, person("Alex Terieur"));
    const foreign = (await service.listAgendaPersons(other)).map((p) => p.id);
    const result = await service.deleteAgendaPersons(owner, [...(await idsOf(["Jean Bonneau", "Paul Ochon"])), ...foreign]);
    assert.deepEqual(result, { deleted: 2, refused: [] });
    assert.deepEqual((await service.listAgendaPersons(owner)).map((p) => p.fullName), ["Sarah Croche"]);
    assert.equal((await service.listAgendaPersons(other)).length, 1);
  });
});
