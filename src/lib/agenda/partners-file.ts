import { nameWords, normalizePhone } from "./contacts-file";
import { sameGroupName } from "./groups-rules";

/**
 * Reads an address book of partners (lawyers, notaries, craftsmen…) from a
 * spreadsheet, a CSV or a vCard file (Thomas, 2026-11-02). Adaptive: columns
 * are recognised by their usual names (« N° », « Num », « Numéro »…), a single
 * « Nom » column is split into last and first name, an address in several
 * columns is put back together. Pure: the page reads the file in the browser.
 */

export const PARTNER_FIELDS = [
  "civility",
  "lastName",
  "firstName",
  "fullName",
  "company",
  "role",
  "number",
  "street",
  "street2",
  "postcode",
  "city",
  "phone",
  "mobile",
  "email",
  "notes",
  "group",
] as const;
export type PartnerField = (typeof PARTNER_FIELDS)[number];

export const PARTNER_FIELD_LABELS: Readonly<Record<PartnerField, string>> = {
  civility: "Civilité",
  lastName: "Nom",
  firstName: "Prénom",
  fullName: "Nom et prénom",
  company: "Structure",
  role: "Fonction / métier",
  number: "N° de voie",
  street: "Rue / adresse",
  street2: "Complément d'adresse",
  postcode: "Code postal",
  city: "Ville",
  phone: "Téléphone",
  mobile: "Portable",
  email: "E-mail",
  notes: "Notes",
  group: "Groupe / catégorie",
};

/** Usual column names, written as headerKey() reads them (lower case, no accents, letters and digits only). */
const ALIASES: Readonly<Record<PartnerField, readonly string[]>> = {
  civility: ["civilite", "civ", "titre", "appellation", "mmme", "mmmemlle", "salutation", "prefix"],
  lastName: ["nom", "nomdefamille", "nomdenaissance", "nomdusage", "nomusage", "lastname", "surname", "familyname"],
  firstName: ["prenom", "prenoms", "firstname", "givenname"],
  fullName: ["nomprenom", "prenomnom", "nometprenom", "prenometnom", "nomsprenoms", "nomcomplet", "fullname", "name", "displayname", "nomaffiche", "contact", "intervenant", "identite"],
  company: ["societe", "entreprise", "cabinet", "etude", "organisme", "raisonsociale", "structure", "company", "organization", "organisation", "etablissement", "employeur", "denomination"],
  role: ["fonction", "profession", "metier", "qualite", "poste", "jobtitle", "specialite", "activite"],
  number: ["n", "no", "num", "numero", "nvoie", "nodevoie", "numerodevoie", "ndevoie", "nrue", "numrue", "numerorue"],
  street: ["rue", "adresse", "adresse1", "adressel1", "voie", "libellevoie", "address", "address1", "street", "ligneadresse1", "adressepostale"],
  street2: ["adresse2", "adressel2", "complement", "complementdadresse", "complementadresse", "batiment", "bp", "address2", "ligneadresse2", "lieudit"],
  postcode: ["codepostal", "cp", "zip", "zipcode", "postalcode", "postcode"],
  city: ["ville", "commune", "localite", "city", "town"],
  phone: ["telephone", "tel", "fixe", "telfixe", "telephonefixe", "phone", "telbureau", "telephonebureau", "telpro", "businessphone", "telephonetravail"],
  mobile: ["portable", "mobile", "gsm", "telportable", "telmobile", "telephoneportable", "telephonemobile", "cellulaire", "mobilephone", "cell"],
  email: ["email", "mail", "courriel", "adresseelectronique", "adressemail", "adresseemail", "emailaddress", "mel"],
  notes: ["notes", "note", "commentaire", "commentaires", "observations", "observation", "remarques", "remarque", "informations"],
  group: ["groupe", "group", "categorie", "category", "typedecontact", "typecontact", "type"],
};

/** « N° de voie », « Nº », « Téléphone 1 » -> « ndevoie », « n », « telephone1 ». */
export function headerKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Exact alias first; then « telephone1 », « emailpro »: an alias of 4 letters or more starting the name. */
function fieldOf(key: string): PartnerField | null {
  if (key === "") return null;
  const exact = PARTNER_FIELDS.find((f) => ALIASES[f].includes(key));
  if (exact) return exact;
  return PARTNER_FIELDS.find((f) => ALIASES[f].some((alias) => alias.length >= 4 && key.startsWith(alias))) ?? null;
}

/** The field of each column (null = ignored). A field already found is not given twice. */
export function detectColumns(header: readonly unknown[]): (PartnerField | null)[] {
  const taken = new Set<PartnerField>();
  return header.map((cell) => {
    const field = fieldOf(headerKey(cell));
    if (field === null || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

const NAME_FIELDS: readonly PartnerField[] = ["lastName", "fullName", "company"];
const MAX_HEADER_SEARCH = 10;

/** The header: the first row naming at least two known columns, one of them a name or a structure. */
export function findHeaderRow(rows: readonly (readonly unknown[])[]): number {
  return rows.slice(0, MAX_HEADER_SEARCH).findIndex((row) => {
    const fields = detectColumns(row).filter((f): f is PartnerField => f !== null);
    return fields.length >= 2 && fields.some((f) => NAME_FIELDS.includes(f));
  });
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const CIVILITY = /^(ma[iî]tre|me|monsieur|madame|mademoiselle|mme|mlle|mr|m|docteur|dr|pr)\.?\s+/i;

/** « DUPONT-MARTIN » -> « Dupont-Martin »; mixed case is kept as typed. */
export function nameCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** A word in capitals (« BONNEAU », « D'ALMEIDA »), not a lone initial. */
const isCapitalWord = (w: string) => /\p{L}{2}/u.test(w) && w === w.toUpperCase() && w !== w.toLowerCase();

export type SplitName = { civility: string | null; lastName: string | null; firstName: string | null };

/**
 * One cell holding the whole name: « Me Jean BONNEAU », « BONNEAU Jean »,
 * « Bonneau, Jean », « Bonneau Jean » (read « Nom Prénom », Thomas 2026-11-02).
 */
export function splitFullName(raw: string): SplitName {
  let text = raw.replace(/\s+/g, " ").trim();
  const civility = CIVILITY.exec(text)?.[0].trim() ?? null;
  if (civility) text = text.slice(civility.length).trim();
  if (text === "") return { civility, lastName: null, firstName: null };
  const comma = text.indexOf(",");
  if (comma > 0) return { civility, lastName: nameCase(text.slice(0, comma).trim()), firstName: text.slice(comma + 1).trim() || null };
  const words = text.split(" ");
  const capitals = words.filter(isCapitalWord);
  if (capitals.length > 0 && capitals.length < words.length) {
    const rest = words.filter((w) => !isCapitalWord(w)).join(" ");
    return { civility, lastName: nameCase(capitals.join(" ")), firstName: rest };
  }
  const [last, ...first] = words;
  return { civility, lastName: last ? nameCase(last) : null, firstName: first.length > 0 ? first.join(" ") : null };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/** One partner read from the file; `addressQuery` is looked up on import. */
export type PartnerFileLine = {
  civility: string | null;
  lastName: string | null;
  firstName: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  addressQuery: string | null;
  /** The file's group / category, if any (« Avocat »…). */
  groupHint: string | null;
};

export type PartnersFileResult = { lines: PartnerFileLine[]; skipped: number };

type Cells = Partial<Record<PartnerField, string>>;

function cellsOf(row: readonly unknown[], mapping: readonly (PartnerField | null)[]): Cells {
  const cells: Cells = {};
  mapping.forEach((field, i) => {
    const value = row[i];
    const text = value === null || value === undefined ? "" : String(value).trim();
    if (field !== null && text !== "") cells[field] = text;
  });
  return cells;
}

const clip = (text: string | undefined, max: number) => (text ? text.slice(0, max) : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Spreadsheets store « 01000 » as the number 1000. */
function postcodeOf(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\.0+$/, "").replace(/\s/g, "");
  return /^\d{4}$/.test(digits) ? `0${digits}` : digits;
}

/** « 12 », « bis rue des Lilas », « 59000 », « Lille » -> « 12 bis rue des Lilas 59000 Lille ». */
function addressQueryOf(c: Cells): string | null {
  const query = [c.number, c.street, c.street2, postcodeOf(c.postcode), c.city].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return query.length >= 3 ? query.slice(0, 200) : null;
}

/** The name: separate columns; or one cell to split (« Nom et prénom », or a « Nom » column alone). */
function nameOf(c: Cells, hasFirstNameColumn: boolean): SplitName {
  const single = c.fullName ?? (!hasFirstNameColumn ? c.lastName : undefined);
  const split = single ? splitFullName(single) : { civility: null, lastName: c.lastName ? nameCase(c.lastName) : null, firstName: c.firstName ?? null };
  const civility = c.civility ?? split.civility;
  return { civility: clip(civility ?? undefined, 20), lastName: clip(split.lastName ?? undefined, 100), firstName: clip(split.firstName ?? undefined, 100) };
}

function lineOf(c: Cells, hasFirstNameColumn: boolean): PartnerFileLine | null {
  const name = nameOf(c, hasFirstNameColumn);
  const company = clip(c.company, 150);
  if (name.lastName === null && company === null) return null;
  const email = c.email?.split(/[\s;,]+/).find((e) => EMAIL.test(e)) ?? null;
  return {
    ...name,
    company,
    role: clip(c.role, 100),
    phone: normalizePhone(c.phone ?? ""),
    mobile: normalizePhone(c.mobile ?? ""),
    email: clip(email ?? undefined, 200),
    notes: clip(c.notes, 1000),
    addressQuery: addressQueryOf(c),
    groupHint: clip(c.group, 100),
  };
}

/** Far above a real address book. */
export const MAX_FILE_PARTNERS = 2000;

/** The rows under the header, read with `mapping` (detected, or corrected by the user). */
export function readPartnerRows(rows: readonly (readonly unknown[])[], headerIndex: number, mapping: readonly (PartnerField | null)[]): PartnersFileResult {
  const hasFirstNameColumn = mapping.includes("firstName");
  const lines: PartnerFileLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const cells = cellsOf(row, mapping);
    if (Object.keys(cells).length === 0) continue;
    const line = lineOf(cells, hasFirstNameColumn);
    if (line) lines.push(line);
    else skipped++;
  }
  return { lines: lines.slice(0, MAX_FILE_PARTNERS), skipped: skipped + Math.max(0, lines.length - MAX_FILE_PARTNERS) };
}

// ---------------------------------------------------------------------------
// vCard (.vcf: the address book of a mail program or a phone)
// ---------------------------------------------------------------------------

/** « Jean\, Paul » -> « Jean, Paul »; folded lines joined. */
function vcardLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const unescape = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

/** « TEL;TYPE=CELL:06… » -> { name: "TEL", params: "TYPE=CELL", value: "06…" }. */
function vcardProperty(line: string): { name: string; params: string; value: string } {
  const colon = line.indexOf(":");
  const head = colon < 0 ? line : line.slice(0, colon);
  const [rawName = "", ...params] = head.split(";");
  return { name: rawName.replace(/^item\d+\./i, "").toUpperCase(), params: params.join(";").toUpperCase(), value: colon < 0 ? "" : line.slice(colon + 1) };
}

/** One vCard -> the cells of a spreadsheet row. */
function vcardCells(card: readonly string[]): Cells {
  const c: Cells = {};
  const set = (field: PartnerField, value: string) => {
    if (value !== "" && c[field] === undefined) c[field] = value;
  };
  for (const line of card) {
    const { name, params, value } = vcardProperty(line);
    const parts = value.split(/(?<!\\);/).map(unescape);
    if (name === "N") {
      set("lastName", parts[0] ?? "");
      set("firstName", [parts[1], parts[2]].filter(Boolean).join(" "));
      set("civility", parts[3] ?? "");
    } else if (name === "FN") set("fullName", unescape(value));
    else if (name === "ORG") set("company", parts.filter(Boolean).join(" "));
    else if (name === "TITLE" || name === "ROLE") set("role", unescape(value));
    else if (name === "TEL") set(/CELL|MOBILE/.test(params) ? "mobile" : "phone", unescape(value));
    else if (name === "EMAIL") set("email", unescape(value));
    else if (name === "NOTE") set("notes", unescape(value));
    else if (name === "CATEGORIES") set("group", parts[0] ?? "");
    else if (name === "ADR") {
      set("street", [parts[2], parts[1]].filter(Boolean).join(" "));
      set("city", parts[3] ?? "");
      set("postcode", parts[5] ?? "");
    }
  }
  return c;
}

export function readVcards(text: string): PartnersFileResult {
  const lines: PartnerFileLine[] = [];
  let skipped = 0;
  let card: string[] | null = null;
  for (const line of vcardLines(text)) {
    if (/^BEGIN:VCARD$/i.test(line)) card = [];
    else if (/^END:VCARD$/i.test(line) && card) {
      const cells = vcardCells(card);
      // The structured name (N) wins over the display name (FN).
      const read = lineOf(cells.lastName ? { ...cells, fullName: undefined } : cells, true);
      if (read) lines.push(read);
      else skipped++;
      card = null;
    } else card?.push(line);
  }
  return { lines: lines.slice(0, MAX_FILE_PARTNERS), skipped };
}

// ---------------------------------------------------------------------------
// Groups and duplicates
// ---------------------------------------------------------------------------

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Trades that go to the « Artisans » group. */
const CRAFTS = /artisan|plomb|electric|macon|menuis|serrur|peintr|bricol|tout faire|jardin|chauffag|couvreur|vitrier|carrel|depann|demenag|nettoyage|entretien/;

/** « Avocats » -> « avocat »; « Artisans / hommes à tout faire » -> « artisan ». */
const stemOf = (groupName: string) => (plain(groupName).match(/[a-z]+/)?.[0] ?? "").replace(/s$/, "");

/** The group a line belongs to, from the file's category, then its function and structure. Null = let the user choose. */
export function guessGroup<G extends { id: string; name: string }>(line: PartnerFileLine, groups: readonly G[]): G | null {
  if (line.groupHint) {
    const named = groups.find((g) => sameGroupName(g.name, line.groupHint ?? ""));
    if (named) return named;
  }
  const text = plain([line.groupHint, line.role, line.company].filter(Boolean).join(" "));
  if (text === "") return null;
  const byStem = groups.find((g) => {
    const stem = stemOf(g.name);
    return stem.length >= 4 && text.includes(stem);
  });
  if (byStem) return byStem;
  return CRAFTS.test(text) ? (groups.find((g) => stemOf(g.name) === "artisan") ?? null) : null;
}

type Known = { id: string; lastName: string | null; firstName: string | null; company: string | null; email: string | null };

const sameWords = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");

/** The contact already in the address book for this line: same name (any order), same structure without a name, or same e-mail. */
export function findDuplicate<K extends Known>(line: PartnerFileLine, known: readonly K[]): K | null {
  const lineName = nameWords([line.firstName, line.lastName].filter(Boolean).join(" "));
  return (
    known.find((k) => {
      if (line.email && k.email && plain(line.email) === plain(k.email)) return true;
      if (line.lastName) return sameWords(lineName, nameWords([k.firstName, k.lastName].filter(Boolean).join(" ")));
      return k.lastName === null && line.company !== null && k.company !== null && sameWords(nameWords(line.company), nameWords(k.company));
    }) ?? null
  );
}
