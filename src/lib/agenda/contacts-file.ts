/**
 * Reads a list of protected persons exported from the MJPM's business software
 * (Proxima « Adresses » export, or any sheet with the same column names).
 * Pure: the page reads the file in the browser and sends only what this keeps —
 * name, address and phone. Social security number, birth date, CAF number,
 * measures… never leave the computer.
 */

export type FileContact = {
  firstName: string;
  lastName: string;
  /** « Nom d'usage » (married name…), when different from the birth name. */
  usageName: string | null;
  /** What the address search is asked: « 12 rue des Lilas 59000 Lille ». */
  address: string | null;
  phone: string | null;
};

export type ContactsFileResult =
  | { ok: true; contacts: FileContact[]; deceased: number }
  | { ok: false; error: string };

type Column = "lastName" | "usageName" | "firstName" | "address" | "postcode" | "city" | "phone" | "deathDate";

/** Header -> letters and digits only, accents removed (« Prénom », « PRENOM », « Pr?nom » all read « prenom » or « prnom »). */
function headerKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADERS: Record<Column, RegExp> = {
  lastName: /^nom(denaissance)?$/,
  usageName: /^nomd?usage$/,
  firstName: /^pr?e?nom$/,
  address: /^adresse(pard?e?faut)?$/,
  postcode: /^(cp|codepostal)$/,
  city: /^(ville|commune)$/,
  phone: /^(te?l|te?le?phone|portable)$/,
  deathDate: /^dated?e?ce?s$/,
};

function findColumns(header: unknown[]): Partial<Record<Column, number>> {
  const keys = header.map(headerKey);
  const columns: Partial<Record<Column, number>> = {};
  for (const column of Object.keys(HEADERS) as Column[]) {
    const index = keys.findIndex((key) => HEADERS[column].test(key));
    if (index >= 0) columns[column] = index;
  }
  return columns;
}

/** The header is the first row naming at least « Nom » and « Prénom » (some exports start with a title). */
const MAX_HEADER_SEARCH = 10;

function cell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  const value = row[index];
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Spreadsheets store « 01000 » as the number 1000. */
function postcodeOf(raw: string): string {
  const digits = raw.replace(/\.0+$/, "").replace(/\s/g, "");
  return /^\d{4}$/.test(digits) ? `0${digits}` : digits;
}

const POSTCODE_LINE = /^\d{5}\b/;
const NUMBERED_STREET = /^\d+\s*(bis|ter|[a-z])?\b[\s,]+\S/i;
const STREET_WORD = /(^|\s)(rue|avenue|av|bd|boulevard|chemin|place|all[ée]e|impasse|route|quai|cours|square|voie|sentier|passage|rond-point)(\s|$)/i;
/** Only when no line names a street: « Résidence X », « Lieu-dit Y ». */
const PLACE_WORD = /(^|\s)(r[ée]sidence|lieu[- ]dit|hameau|lotissement|cit[ée]|domaine|le bourg)(\s|$)/i;

/** The street line of a multi-line postal address (« Résidence X / 12 rue Y / 59000 Lille » -> « 12 rue Y »). */
function streetLine(address: string): string | null {
  const lines = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^-{2,}/.test(line) && !POSTCODE_LINE.test(line));
  return (
    lines.find((l) => NUMBERED_STREET.test(l)) ??
    lines.find((l) => STREET_WORD.test(l)) ??
    lines.find((l) => PLACE_WORD.test(l)) ??
    lines[0] ??
    null
  );
}

/** A French postcode + town found on the last line of the address, when the columns are empty. */
function townFromAddress(address: string): string {
  const last = address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? "";
  return POSTCODE_LINE.test(last) ? last : "";
}

function addressQuery(row: unknown[], columns: Partial<Record<Column, number>>): string | null {
  const raw = cell(row, columns.address);
  const town = [postcodeOf(cell(row, columns.postcode)), cell(row, columns.city)].filter(Boolean).join(" ") || townFromAddress(raw);
  const street = raw ? streetLine(raw) : null;
  const query = [street, town].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return query.length >= 3 ? query.slice(0, 200) : null;
}

/** « 06-12-34-56-78 » -> « 06 12 34 56 78 »; anything without digits -> null. */
export function normalizePhone(raw: string): string | null {
  const first = raw.split(/\r?\n|\/|;/).map((part) => part.trim()).find((part) => /\d/.test(part));
  if (!first) return null;
  const digits = first.replace(/[^0-9+]/g, "");
  if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
  if (/^\+33\d{9}$/.test(digits)) return `0${digits.slice(3)}`.replace(/(\d{2})(?=\d)/g, "$1 ");
  const cleaned = first.replace(/[^0-9+().\s-]/g, "").trim();
  return cleaned.length >= 6 && cleaned.length <= 30 ? cleaned : null;
}

/** Far above a real caseload: a bigger file is not an MJPM's list of persons. */
export const MAX_FILE_CONTACTS = 2000;

const MISSING_COLUMNS =
  "Colonnes « Nom » et « Prénom » introuvables. Utilisez l'export « Adresses » de votre logiciel métier (Proxima…), sans le modifier.";

/** Rows of the first sheet (first row = header) -> the persons to import. */
export function readContactRows(rows: unknown[][]): ContactsFileResult {
  const headerIndex = rows.slice(0, MAX_HEADER_SEARCH).findIndex((row) => {
    const columns = findColumns(row);
    return columns.lastName !== undefined && columns.firstName !== undefined;
  });
  if (headerIndex < 0) return { ok: false, error: MISSING_COLUMNS };
  const columns = findColumns(rows[headerIndex]);
  const contacts: FileContact[] = [];
  let deceased = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const lastName = cell(row, columns.lastName);
    const firstName = cell(row, columns.firstName);
    if (!lastName || !firstName) continue;
    if (cell(row, columns.deathDate)) {
      deceased++;
      continue;
    }
    const usageName = cell(row, columns.usageName);
    contacts.push({
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      usageName: usageName && usageName.toLowerCase() !== lastName.toLowerCase() ? usageName.slice(0, 100) : null,
      address: addressQuery(row, columns),
      phone: normalizePhone(cell(row, columns.phone)),
    });
  }
  if (contacts.length > MAX_FILE_CONTACTS) return { ok: false, error: `Le fichier contient plus de ${MAX_FILE_CONTACTS} personnes.` };
  if (contacts.length === 0) return { ok: false, error: "Aucune personne trouvée dans ce fichier." };
  return { ok: true, contacts, deceased };
}

// ---------------------------------------------------------------------------
// Matching with the persons already known (agenda or dossiers)
// ---------------------------------------------------------------------------

/** Name -> its words, accents and case removed (« DUPONT Jean-Marc » = « Jean Marc Dupont »). */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0);
}

/** « DUPONT-MARTIN » -> « Dupont-Martin », « D'ALMEIDA » -> « D'Almeida »; mixed case is kept as typed. */
function nameCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** Display name of an imported person: usual first name then usage name (« Jeanne Dupont »). */
export function displayName(contact: FileContact): string {
  return `${nameCase(contact.firstName)} ${nameCase(contact.usageName ?? contact.lastName)}`.replace(/\s+/g, " ").trim();
}

/**
 * Does this known name designate this person of the file? Same words in any
 * order, with the birth or the usage name; or every word of the known name
 * found in the file (« Jean Dupont » for « Jean Marc DUPONT ép. MARTIN »), when
 * it holds a first name and a last name.
 */
export function isSamePerson(knownName: string, contact: FileContact): boolean {
  const known = nameWords(knownName);
  if (known.length < 2) return false;
  const first = nameWords(contact.firstName);
  const lasts = [contact.lastName, contact.usageName].filter((n): n is string => n !== null).map(nameWords);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
  if (lasts.some((last) => sameSet(known, [...first, ...last]))) return true;
  const all = new Set([...first, ...lasts.flat()]);
  const hasFirst = known.some((w) => first.includes(w));
  const hasLast = lasts.some((last) => last.length > 0 && last.every((w) => known.includes(w)));
  return hasFirst && hasLast && known.every((w) => all.has(w));
}

/** The single known entry matching this person; null when none, or when several (never guess). */
export function findSamePerson<T extends { fullName: string }>(known: T[], contact: FileContact): T | null | "ambiguous" {
  const matches = known.filter((k) => isSamePerson(k.fullName, contact));
  if (matches.length === 0) return null;
  return matches.length === 1 ? matches[0] : "ambiguous";
}
