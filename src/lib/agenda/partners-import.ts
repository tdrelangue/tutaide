import { z } from "zod";
import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";
import { TX_OPTIONS, type Tx } from "./bridge/lock";
import { geocodeFromFile, type Geocode } from "./contacts-import";
import { assertGroupInScope, partnerWhere, type AddressBook } from "./groups";
import { syncPartnerContacts } from "./partner-contacts";
import { MAX_FILE_PARTNERS } from "./partners-file";
import { partnerName } from "./rules";
import { seal, sealPoint } from "./sealed";
import type { Place } from "./service";
import { phoneSchema } from "./validation";

/**
 * Imports the contacts read from a file (partners-file.ts) into the shared
 * address book (Thomas, 2026-11-02). Each line was checked by the user: its
 * group, and for a contact already in the book, whether the file only fills
 * what is missing (« keep ») or replaces it (« replace »). Addresses are looked
 * up like the persons' import.
 */

const text = (max: number) => z.string().trim().max(max).nullable();
const id = z.string().regex(/^[a-z0-9]{20,40}$/);

export const partnerImportLineSchema = z.object({
  civility: text(20),
  lastName: text(100),
  firstName: text(100),
  company: text(150),
  role: text(100),
  phone: phoneSchema,
  mobile: phoneSchema,
  email: text(200).refine((v) => v === null || z.string().email().safeParse(v).success),
  notes: text(1000),
  addressQuery: text(200),
  groupId: id.nullable(),
  /** The contact already in the book this line updates; null = a new contact. */
  existingId: id.nullable(),
  mode: z.enum(["keep", "replace"]),
});
export type PartnerImportLine = z.infer<typeof partnerImportLineSchema>;

export const partnerImportSchema = z
  .array(partnerImportLineSchema.refine((l) => l.lastName !== null || l.company !== null))
  .min(1, "Aucun contact à importer.")
  .max(MAX_FILE_PARTNERS, `Le fichier contient plus de ${MAX_FILE_PARTNERS} contacts.`);

export type PartnerImportReport = {
  added: number;
  completed: number;
  replaced: number;
  /** Imported without an address (none in the file, or not found). */
  addressNotFound: string[];
  /** Found, but only the street or the town. */
  imprecise: string[];
};

const GEOCODE_CONCURRENCY = 4;
/** Up to a few thousand writes: more time than a single save. */
const IMPORT_TX_OPTIONS = { ...TX_OPTIONS, timeout: 120_000 } as const;

type Existing = { id: string; address: string | null; phone: string | null; mobile: string | null; email: string | null; notes: string | null; role: string | null; company: string | null; firstName: string | null; civility: string | null };

/** Whose address is looked up: new contacts, replaced ones, and kept ones that have none. */
function needsAddress(line: PartnerImportLine, existing: Existing | undefined): boolean {
  if (line.addressQuery === null) return false;
  return existing === undefined || line.mode === "replace" || existing.address === null;
}

async function geocodeLines(lines: readonly PartnerImportLine[], existing: ReadonlyMap<string, Existing>, geocode: Geocode): Promise<Map<string, Place | null>> {
  const queries = [...new Set(lines.filter((l) => needsAddress(l, l.existingId ? existing.get(l.existingId) : undefined)).map((l) => l.addressQuery ?? ""))];
  const found = new Map<string, Place | null>();
  for (let i = 0; i < queries.length; i += GEOCODE_CONCURRENCY) {
    const batch = queries.slice(i, i + GEOCODE_CONCURRENCY);
    const places = await Promise.all(batch.map((q) => geocode(q).catch(() => null)));
    batch.forEach((q, j) => found.set(q, places[j] ?? null));
  }
  return found;
}

function addressColumns(place: Place | null) {
  return place
    ? { address: seal(place.label), point: sealPoint(place), precision: place.precision }
    : { address: null, point: null, precision: null };
}

/** The file's values, encrypted where the book encrypts them. */
function fileColumns(line: PartnerImportLine) {
  return {
    civility: line.civility,
    lastName: line.lastName,
    firstName: line.firstName,
    company: line.company,
    role: line.role,
    phone: line.phone === null ? null : seal(line.phone),
    mobile: line.mobile === null ? null : seal(line.mobile),
    email: line.email === null ? null : seal(line.email),
    notes: line.notes === null ? null : seal(line.notes),
  };
}

/** « keep »: only what the book does not have yet. */
function missingColumns(line: PartnerImportLine, e: Existing) {
  const file = fileColumns(line);
  return {
    civility: e.civility ?? file.civility,
    firstName: e.firstName ?? file.firstName,
    company: e.company ?? file.company,
    role: e.role ?? file.role,
    phone: e.phone ?? file.phone,
    mobile: e.mobile ?? file.mobile,
    email: e.email ?? file.email,
    notes: e.notes ?? file.notes,
  };
}

type Step = { line: PartnerImportLine; existing: Existing | undefined; place: Place | null | undefined };

async function writeLine(tx: Tx, book: AddressBook, actorId: string, step: Step, report: PartnerImportReport): Promise<void> {
  const { line, existing, place } = step;
  const address = place === undefined ? {} : addressColumns(place);
  if (!existing) {
    const bookColumns = "orgId" in book ? { orgId: book.orgId } : { userId: book.userId };
    await tx.agendaPartner.create({ data: { ...bookColumns, createdById: actorId, groupId: line.groupId, ...fileColumns(line), ...address } });
    report.added++;
    return;
  }
  const keepAddress = line.mode === "keep" && existing.address !== null;
  const data = line.mode === "replace" ? { ...fileColumns(line), groupId: line.groupId } : missingColumns(line, existing);
  // A replaced contact without an address in the file keeps its own.
  const addressData = keepAddress || (line.mode === "replace" && place === undefined) ? {} : address;
  await tx.agendaPartner.update({ where: { id: existing.id }, data: { ...data, ...addressData } });
  await syncPartnerContacts(tx, existing.id);
  if (line.mode === "replace") report.replaced++;
  else report.completed++;
}

function noteAddress(step: Step, report: PartnerImportReport): void {
  const name = partnerName(step.line);
  const kept = step.existing && step.existing.address !== null && (step.line.mode === "keep" || step.place === undefined);
  if (kept) return;
  if (!step.place) report.addressNotFound.push(name);
  else if (step.place.precision !== "housenumber") report.imprecise.push(name);
}

export async function importPartnersFromFile(
  book: AddressBook,
  actorId: string,
  lines: readonly PartnerImportLine[],
  geocode: Geocode = geocodeFromFile,
): Promise<PartnerImportReport> {
  const ids = [...new Set(lines.map((l) => l.existingId).filter((x): x is string => x !== null))];
  const rows = await db.agendaPartner.findMany({ where: { ...partnerWhere(book), id: { in: ids } } });
  if (rows.length !== ids.length) throw new AgendaRefusal("Un des contacts du carnet a été supprimé entre-temps : relancez l'import.");
  const existing = new Map(rows.map((r) => [r.id, r]));
  const places = await geocodeLines(lines, existing, geocode);
  const report: PartnerImportReport = { added: 0, completed: 0, replaced: 0, addressNotFound: [], imprecise: [] };
  await db.$transaction(async (tx) => {
    const scope = { kind: "PARTNERS" as const, book };
    for (const groupId of new Set(lines.map((l) => l.groupId))) await assertGroupInScope(tx, scope, groupId);
    for (const line of lines) {
      const known = line.existingId ? existing.get(line.existingId) : undefined;
      const place = needsAddress(line, known) ? (places.get(line.addressQuery ?? "") ?? null) : undefined;
      const step = { line, existing: known, place };
      await writeLine(tx, book, actorId, step, report);
      noteAddress(step, report);
    }
  }, IMPORT_TX_OPTIONS);
  return report;
}
