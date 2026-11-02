import { db } from "@/lib/db";
import { displayName, findSamePerson, type FileContact } from "./contacts-file";
import { searchAddress } from "./geocode";
import { TX_OPTIONS, type Tx } from "./bridge/lock";
import { seal, unseal } from "./sealed";
import { assertRoomFor, findPersonRows, listImportablePersons, placeColumns, replaceDefaultPlace, type Place } from "./service";

/**
 * Imports the persons of a file (contacts-file.ts) into the owner's agenda.
 * A person already in the agenda is completed (address, phone); what differs
 * from the file is replaced only for the persons the user chose (the page
 * asks first: findImportConflicts). A person of the dossiers is added linked to them, so the
 * « Importer depuis mes dossiers » button never adds them twice.
 */

export type ImportReport = {
  added: number;
  completed: number;
  /** Address or phone replaced by the file's, as the user chose. */
  replaced: number;
  unchanged: number;
  /** Names that match several known persons: left alone, to check by hand. */
  ambiguous: string[];
  /** Imported without an address (none in the file, or not found). */
  addressNotFound: string[];
  /** Found, but only the street or the town. */
  imprecise: string[];
  /** Asked to take the file's address, which was not found: the old one is kept. */
  addressKept: string[];
};

/** Lines of the file (index in the list sent) whose differing address / phone replace the agenda's. */
export type ReplaceChoice = ReadonlySet<number>;

/** A person already in the agenda whose address or phone differs from the file. */
export type ImportConflict = {
  index: number;
  name: string;
  current: { address: string | null; phone: string | null };
  file: { address: string | null; phone: string | null };
};

export type Geocode = (query: string) => Promise<Place | null>;

/** Below this confidence the geocoder's best guess is too often another place. */
const MIN_SCORE = 0.5;
const GEOCODE_CONCURRENCY = 4;

/** « 59 », or « 971 » overseas: a match outside the département of the file is another place. */
function departement(postcode: string): string {
  return postcode.startsWith("97") ? postcode.slice(0, 3) : postcode.slice(0, 2);
}

async function bestMatch(query: string, postcode: string | undefined): Promise<Place | null> {
  const result = await searchAddress(query);
  if (!result.ok) return null;
  const best = result.results[0];
  if (!best || best.score < MIN_SCORE) return null;
  const found = best.postcode ?? /\b\d{5}\b/.exec(best.label)?.[0];
  if (postcode && found && departement(found) !== departement(postcode)) return null;
  return { label: best.label, lat: best.lat, lon: best.lon, precision: best.precision };
}

/**
 * Best match of the public address search in the département of the file.
 * When the street is not found, the town at least (reported « à vérifier »).
 */
export const geocodeFromFile: Geocode = async (query) => {
  const postcode = /\b\d{5}\b/.exec(query)?.[0];
  const place = await bestMatch(query, postcode);
  if (place || !postcode) return place;
  const town = query.slice(query.indexOf(postcode));
  return town === query ? null : bestMatch(town, postcode);
};

type Known = Awaited<ReturnType<typeof findPersonRows>>[number];

type Plan =
  | { kind: "ambiguous"; contact: FileContact }
  | { kind: "existing"; contact: FileContact; person: Known; needsAddress: boolean; phone: string | null; replacing: boolean }
  | { kind: "new"; contact: FileContact; dossierGroupKey: string | null };

/** Letters and digits only, accents and case ignored: « 3, Rue du Port » = « 3 rue du port ». */
function plain(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const digits = (phone: string) => phone.replace(/\D/g, "");

/** The search's label often adds or drops a word (« Résidence… », the town): one containing the other is the same place. */
function sameAddress(stored: string, fromFile: string): boolean {
  const [a, b] = [plain(stored), plain(fromFile)];
  return a === b || a.includes(b) || b.includes(a);
}

/** What the file would change for a known person: only where both have a value and they differ. */
function differences(person: Known, contact: FileContact) {
  const stored = person.places[0];
  const address = stored ? unseal(stored.address) : null;
  const phone = unseal(person.phone);
  return {
    address,
    phone,
    addressDiffers: address !== null && contact.address !== null && !sameAddress(address, contact.address),
    phoneDiffers: phone !== null && contact.phone !== null && digits(phone) !== digits(contact.phone),
  };
}

function existingPlan(contact: FileContact, person: Known, replace: boolean): Plan {
  const diff = differences(person, contact);
  const takeAddress = person.places.length === 0 || (replace && diff.addressDiffers);
  const takePhone = person.phone === null || (replace && diff.phoneDiffers);
  return {
    kind: "existing",
    contact,
    person,
    needsAddress: takeAddress && contact.address !== null,
    phone: takePhone ? contact.phone : null,
    replacing: replace && (diff.addressDiffers || diff.phoneDiffers),
  };
}

/** What to do with each person of the file (no writes, no network). */
async function planImport(ownerId: string, contacts: FileContact[], replace: ReplaceChoice = new Set()): Promise<Plan[]> {
  const [known, dossierPersons] = await Promise.all([findPersonRows(ownerId), listImportablePersons(ownerId)]);
  const usedDossiers = new Set<string>();
  const usedPersons = new Set<string>();
  return contacts.map((contact, index): Plan => {
    const person = findSamePerson(known, contact);
    if (person === "ambiguous") return { kind: "ambiguous", contact };
    if (person) {
      // Two lines of the file for one person: neither is guessed.
      if (usedPersons.has(person.id)) return { kind: "ambiguous", contact };
      usedPersons.add(person.id);
      return existingPlan(contact, person, replace.has(index));
    }
    const dossier = findSamePerson(dossierPersons, contact);
    if (dossier === "ambiguous") return { kind: "ambiguous", contact };
    if (dossier && !usedDossiers.has(dossier.dossierGroupKey)) {
      usedDossiers.add(dossier.dossierGroupKey);
      return { kind: "new", contact, dossierGroupKey: dossier.dossierGroupKey };
    }
    return { kind: "new", contact, dossierGroupKey: null };
  });
}

/** Persons of the file already in the agenda with another address or phone: the page asks what to keep. */
export async function findImportConflicts(ownerId: string, contacts: FileContact[]): Promise<ImportConflict[]> {
  const plans = await planImport(ownerId, contacts);
  return plans.flatMap((plan, index): ImportConflict[] => {
    if (plan.kind !== "existing") return [];
    const diff = differences(plan.person, plan.contact);
    if (!diff.addressDiffers && !diff.phoneDiffers) return [];
    return [{
      index,
      name: plan.person.fullName,
      current: { address: diff.address, phone: diff.phone },
      file: { address: plan.contact.address, phone: plan.contact.phone },
    }];
  });
}

/** Address of every planned person that needs one, a few requests at a time. */
async function geocodeAll(plans: Plan[], geocode: Geocode): Promise<Map<FileContact, Place | null>> {
  const wanted = plans.filter((p) => (p.kind === "new" || (p.kind === "existing" && p.needsAddress)) && p.contact.address !== null);
  const found = new Map<FileContact, Place | null>();
  for (let i = 0; i < wanted.length; i += GEOCODE_CONCURRENCY) {
    const batch = wanted.slice(i, i + GEOCODE_CONCURRENCY);
    const places = await Promise.all(batch.map((p) => geocode(p.contact.address ?? "").catch(() => null)));
    batch.forEach((p, index) => found.set(p.contact, places[index]));
  }
  return found;
}

function emptyReport(): ImportReport {
  return { added: 0, completed: 0, replaced: 0, unchanged: 0, ambiguous: [], addressNotFound: [], imprecise: [], addressKept: [] };
}

function noteAddress(report: ImportReport, name: string, place: Place | null): void {
  if (place === null) report.addressNotFound.push(name);
  else if (place.precision !== "housenumber") report.imprecise.push(name);
}

/** Completes a person already in the agenda (address, phone if none), or replaces them as chosen. */
async function completeExisting(tx: Tx, ownerId: string, plan: Extract<Plan, { kind: "existing" }>, place: Place | null, report: ImportReport) {
  const hadAddress = plan.person.places.length > 0;
  const setPlace = plan.needsAddress && place !== null;
  // Asked to take the file's address, not found: the old one stays.
  if (plan.needsAddress && hadAddress && place === null) report.addressKept.push(plan.person.fullName);
  else if (plan.needsAddress) noteAddress(report, plan.person.fullName, place);
  if (!setPlace && plan.phone === null) {
    report.unchanged++;
    return;
  }
  const key = { id_ownerId: { id: plan.person.id, ownerId } };
  if (plan.phone !== null) await tx.agendaContact.update({ where: key, data: { phone: seal(plan.phone) } });
  // Updated in place: appointments held at the old address keep pointing at it.
  if (setPlace) await replaceDefaultPlace(tx, ownerId, plan.person.id, place);
  if (plan.replacing) report.replaced++;
  else report.completed++;
}

/** Same defaults as the dossier import: one visit per quarter. */
async function addNew(tx: Tx, ownerId: string, actorId: string, plan: Extract<Plan, { kind: "new" }>, place: Place | null, report: ImportReport) {
  const name = displayName(plan.contact);
  const contact = await tx.agendaContact.create({
    data: {
      ownerId,
      createdById: actorId,
      category: "PROTEGE",
      fullName: name,
      dossierGroupKey: plan.dossierGroupKey,
      phone: plan.contact.phone === null ? null : seal(plan.contact.phone),
      visitsPerPeriod: 1,
      visitPeriod: "QUARTER",
    },
  });
  if (place) await tx.agendaPlace.create({ data: { ...placeColumns(ownerId, place), contactId: contact.id } });
  noteAddress(report, name, place);
  report.added++;
}

/** Up to ~100 writes for a full caseload: more time than a single-person save. */
const IMPORT_TX_OPTIONS = { ...TX_OPTIONS, timeout: 60_000 } as const;

export async function importContactsFromFile(
  ownerId: string,
  actorId: string,
  contacts: FileContact[],
  replace: ReplaceChoice = new Set(),
  geocode: Geocode = geocodeFromFile,
): Promise<ImportReport> {
  const plans = await planImport(ownerId, contacts, replace);
  const places = await geocodeAll(plans, geocode);
  const report = emptyReport();
  await db.$transaction(async (tx) => {
    await assertRoomFor(tx, ownerId, plans.filter((p) => p.kind === "new").length);
    for (const plan of plans) {
      const place = places.get(plan.contact) ?? null;
      if (plan.kind === "ambiguous") report.ambiguous.push(displayName(plan.contact));
      else if (plan.kind === "existing") await completeExisting(tx, ownerId, plan, place, report);
      else await addNew(tx, ownerId, actorId, plan, place, report);
    }
  }, IMPORT_TX_OPTIONS);
  return report;
}
