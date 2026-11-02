// Thomas, 2026-11-02: import contacts from a file, adaptively (« N° », « Num », « Numéro »…; one « Nom » column split).
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { addressBookOf, listPartners, createPartner } from "../partners";
import {
  detectColumns,
  findDuplicate,
  findHeaderRow,
  guessGroup,
  readPartnerRows,
  readVcards,
  splitFullName,
  type PartnerFileLine,
} from "../partners-file";
import { importPartnersFromFile, type PartnerImportLine } from "../partners-import";
import { listGroups } from "../groups";
import { agendaPartnerSchema } from "../validation";
import { createTestDb } from "./db";
import { LILLE, seedOwner } from "./bridge-fixtures";

describe("columns are recognised by their usual names", () => {
  it("reads French and English headers, with or without accents and signs", () => {
    assert.deepEqual(detectColumns(["Civilité", "NOM", "Prénom", "Société", "Fonction", "N°", "Rue", "Code postal", "Ville", "Tél.", "Portable", "Courriel"]), [
      "civility", "lastName", "firstName", "company", "role", "number", "street", "postcode", "city", "phone", "mobile", "email",
    ]);
    assert.deepEqual(detectColumns(["Nº", "num", "Numéro de voie", "CP", "E-mail", "Téléphone 1", "Name", "Company", "Job Title"]), [
      "number", null, null, "postcode", "email", "phone", "fullName", "company", "role",
    ], "a field already found is not given twice");
    assert.deepEqual(detectColumns(["Nom et prénom", "Adresse ligne 1", "Adresse 2", "Commentaires", "Catégorie", "Colonne X"]), [
      "fullName", "street", "street2", "notes", "group", null,
    ]);
  });

  it("finds the header under a title line", () => {
    assert.equal(findHeaderRow([["Carnet d'adresses 2026"], [], ["Nom", "Prénom", "Téléphone"], ["Bonneau", "Jean", "0612345678"]]), 2);
    assert.equal(findHeaderRow([["a", "b"], ["c", "d"]]), -1);
  });
});

describe("names", () => {
  it("splits a single cell: civility, the name in capitals, else « Nom Prénom »", () => {
    assert.deepEqual(splitFullName("Me Jean BONNEAU"), { civility: "Me", lastName: "Bonneau", firstName: "Jean" });
    assert.deepEqual(splitFullName("DE LA FONTAINE Jean-Marc"), { civility: null, lastName: "De La Fontaine", firstName: "Jean-Marc" });
    assert.deepEqual(splitFullName("Bonneau, Jean"), { civility: null, lastName: "Bonneau", firstName: "Jean" });
    assert.deepEqual(splitFullName("Bonneau Jean"), { civility: null, lastName: "Bonneau", firstName: "Jean" });
    assert.deepEqual(splitFullName("Maître Terieur"), { civility: "Maître", lastName: "Terieur", firstName: null });
  });

  it("splits a « Nom » column when there is no « Prénom » column, keeps them apart otherwise", () => {
    const alone = readPartnerRows([["Nom", "Tél"], ["TERIEUR Alex", "06 11 22 33 44"]], 0, detectColumns(["Nom", "Tél"]));
    assert.deepEqual([alone.lines[0]?.lastName, alone.lines[0]?.firstName], ["Terieur", "Alex"]);
    const both = readPartnerRows([["Nom", "Prénom"], ["Terieur Dupont", "Alex"]], 0, detectColumns(["Nom", "Prénom"]));
    assert.deepEqual([both.lines[0]?.lastName, both.lines[0]?.firstName], ["Terieur Dupont", "Alex"]);
  });
});

describe("lines", () => {
  const header = ["Nom", "Prénom", "Société", "N°", "Voie", "CP", "Ville", "Tél", "Mail"];
  const mapping = detectColumns(header);

  it("puts the address back together and cleans phones and e-mails", () => {
    const { lines } = readPartnerRows([header, ["Terieur", "Alex", "Étude Terieur", "12", "rue des Lilas", "9000", "Lille", "06.11.22.33.44", "a@b.fr; autre"]], 0, mapping);
    const line = lines[0];
    assert.equal(line?.addressQuery, "12 rue des Lilas 09000 Lille");
    assert.equal(line?.phone, "06 11 22 33 44");
    assert.equal(line?.email, "a@b.fr");
  });

  it("keeps a structure without a name, and counts the lines with neither", () => {
    const { lines, skipped } = readPartnerRows([header, ["", "", "SARL Bricol'"], ["", "", "", "3", "rue X"], ["", "", ""]], 0, mapping);
    assert.deepEqual(lines.map((l) => l.company), ["SARL Bricol'"]);
    assert.equal(skipped, 1, "the empty row is not counted, the row with only an address is");
  });
});

describe("vCard", () => {
  it("reads the address book of a mail program", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "N:Terieur;Alex;;Me;", "FN:Me Alex Terieur", "ORG:Étude Terieur", "TITLE:Notaire",
      "TEL;TYPE=WORK:05 55 00 00 00", "TEL;TYPE=CELL:06 11 22 33 44", "EMAIL:etude@test.invalid",
      "ADR;TYPE=WORK:;;12 rue des Lilas;Lille;;59000;France", "END:VCARD",
      "BEGIN:VCARD", "FN:SARL Bricol'", "ORG:SARL Bricol'", "END:VCARD",
    ].join("\r\n");
    const { lines } = readVcards(vcf);
    assert.equal(lines.length, 2);
    assert.deepEqual([lines[0]?.civility, lines[0]?.lastName, lines[0]?.firstName, lines[0]?.role], ["Me", "Terieur", "Alex", "Notaire"]);
    assert.deepEqual([lines[0]?.phone, lines[0]?.mobile], ["05 55 00 00 00", "06 11 22 33 44"]);
    assert.equal(lines[0]?.addressQuery, "12 rue des Lilas 59000 Lille");
  });
});

const line = (fields: Partial<PartnerFileLine>): PartnerFileLine => ({
  civility: null, lastName: null, firstName: null, company: null, role: null, phone: null, mobile: null, email: null, notes: null, addressQuery: null, groupHint: null,
  ...fields,
});

describe("groups and duplicates", () => {
  const groups = [
    { id: "a", name: "Avocats" },
    { id: "n", name: "Notaires" },
    { id: "r", name: "Artisans / hommes à tout faire" },
    { id: "o", name: "Autres partenaires" },
  ];

  it("guesses the group from the category, the function or the structure", () => {
    assert.equal(guessGroup(line({ groupHint: "Notaires" }), groups)?.id, "n");
    assert.equal(guessGroup(line({ role: "Avocate au barreau de Tulle" }), groups)?.id, "a");
    assert.equal(guessGroup(line({ company: "Étude notariale Terieur", role: "Notaire associé" }), groups)?.id, "n");
    assert.equal(guessGroup(line({ role: "Plombier chauffagiste" }), groups)?.id, "r");
    assert.equal(guessGroup(line({ role: "Banquier" }), groups), null);
  });

  it("spots a contact already in the book by name, structure or e-mail", () => {
    const known = [
      { id: "1", lastName: "Terieur", firstName: "Alex", company: null, email: null },
      { id: "2", lastName: null, firstName: null, company: "SARL Bricol'", email: "bricol@test.invalid" },
    ];
    assert.equal(findDuplicate(line({ lastName: "TERIEUR", firstName: "Alex" }), known)?.id, "1");
    assert.equal(findDuplicate(line({ company: "sarl bricol" }), known)?.id, "2");
    assert.equal(findDuplicate(line({ lastName: "Autre", email: "Bricol@test.invalid" }), known)?.id, "2");
    assert.equal(findDuplicate(line({ lastName: "Terieur", firstName: "Sam" }), known), null);
  });
});

let client: PrismaClient;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const toImport = (fields: Partial<PartnerImportLine>): PartnerImportLine => ({
  ...line({}),
  groupId: null,
  existingId: null,
  mode: "keep",
  ...fields,
});
const geocode = async (query: string) => (query.includes("Lilas") ? LILLE : null);

describe("importing into the address book", () => {
  it("adds new contacts with their group and address, and reports the addresses not found", async () => {
    const owner = await seedOwner(client, "import-partners@test.invalid");
    const book = await addressBookOf(owner);
    const notaires = (await listGroups({ kind: "PARTNERS", book })).find((g) => g.name === "Notaires");
    const report = await importPartnersFromFile(book, owner, [
      toImport({ lastName: "Terieur", firstName: "Alex", groupId: notaires?.id ?? null, addressQuery: "12 rue des Lilas 59000 Lille", phone: "06 11 22 33 44" }),
      toImport({ company: "SARL Bricol'", addressQuery: "nulle part" }),
    ], geocode);
    assert.deepEqual([report.added, report.addressNotFound], [2, ["SARL Bricol'"]]);
    const partners = await listPartners(book, owner);
    const alex = partners.find((p) => p.lastName === "Terieur");
    assert.equal(alex?.groupId, notaires?.id);
    assert.equal(alex?.address?.label, LILLE.label);
    assert.equal(alex?.phone, "06 11 22 33 44");
  });

  it("« compléter » fills only what is missing; « remplacer » takes the file's values", async () => {
    const owner = await seedOwner(client, "import-dup@test.invalid");
    const book = await addressBookOf(owner);
    const first = await createPartner(book, owner, owner, agendaPartnerSchema.parse({ lastName: "Terieur", phone: "05 55 00 00 00" }));
    const second = await createPartner(book, owner, owner, agendaPartnerSchema.parse({ lastName: "Croche", role: "Avocate" }));
    const report = await importPartnersFromFile(book, owner, [
      toImport({ lastName: "Terieur", phone: "06 99 99 99 99", email: "alex@test.invalid", existingId: first, mode: "keep" }),
      toImport({ lastName: "Croche", role: "Notaire", existingId: second, mode: "replace" }),
    ], geocode);
    assert.deepEqual([report.completed, report.replaced, report.added], [1, 1, 0]);
    const partners = await listPartners(book, owner);
    const alex = partners.find((p) => p.id === first);
    assert.deepEqual([alex?.phone, alex?.email], ["05 55 00 00 00", "alex@test.invalid"]);
    assert.equal(partners.find((p) => p.id === second)?.role, "Notaire");
  });

  it("refuses a contact of another address book as the one to update", async () => {
    const owner = await seedOwner(client, "import-guard@test.invalid");
    const other = await seedOwner(client, "import-guard-other@test.invalid");
    const foreign = await createPartner(await addressBookOf(other), other, other, agendaPartnerSchema.parse({ lastName: "Pris" }));
    await assert.rejects(importPartnersFromFile(await addressBookOf(owner), owner, [toImport({ lastName: "Pris", existingId: foreign })], geocode));
    assert.equal((await listPartners(await addressBookOf(other), other))[0]?.lastName, "Pris");
  });
});
