import { db } from "@/lib/db";
import { personsFromDossiers, type AgendaEndReasonValue, type AgendaPeriodValue, type DossierPerson } from "./rules";
import type { AddressPrecision } from "./geocode";
import { AgendaRefusal } from "./bridge/errors";
import { TX_OPTIONS } from "./bridge/lock";
import type { Tx } from "./bridge/lock";
import { seal, sealOrNull, sealPoint, unseal, unsealPoint } from "./sealed";
import type { AgendaPersonInput, AgendaSettingsInput } from "./validation";

/**
 * « Agenda » data access. Every function takes the owner (MJPM) id resolved
 * by requireAgendaOwner — never an id coming from the client. Addresses and
 * notes are encrypted at rest (sealed.ts).
 */

export type Place = { label: string; lat: number; lon: number; precision: AddressPrecision };

export type AgendaSettingsView = {
  home: Place | null;
  office: Place | null;
  workDays: number[];
  dayStartMinutes: number;
  /** Wished end of the day, drive home included. */
  dayEndMinutes: number;
  /** Strict limit, drive home included (null = same as the wished end). */
  dayEndLimitMinutes: number | null;
  defaultVisitMinutes: number;
};

/** A protected person to visit (an AgendaContact of category PROTEGE). */
export type AgendaPersonView = {
  id: string;
  fullName: string;
  fromDossiers: boolean;
  address: Place | null;
  /** Null = no regular visits. */
  visitsPerPeriod: number | null;
  visitPeriod: AgendaPeriodValue | null;
  visitMinutes: number | null;
  notes: string | null;
  lastVisitOn: string | null;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  endReason: AgendaEndReasonValue | null;
};

/** Same defaults as the AgendaSettings columns. */
const DEFAULT_SETTINGS: AgendaSettingsView = {
  home: null,
  office: null,
  workDays: [1, 2, 3, 4, 5],
  dayStartMinutes: 510,
  dayEndMinutes: 1080,
  dayEndLimitMinutes: 1140,
  defaultVisitMinutes: 60,
};

/** Label shown for the address of a protected person (position 0 = default place). */
const HOME_PLACE_LABEL = "Domicile";

function toPrecision(value: string | null): AddressPrecision {
  return value === "street" || value === "locality" || value === "municipality" ? value : "housenumber";
}

function toPlace(sealedLabel: string | null, sealedPoint: string | null, precision: string | null): Place | null {
  const label = unseal(sealedLabel);
  const point = unsealPoint(sealedPoint);
  if (label === null && point === null) return null;
  // Half an address read as « no address » would be erased by the next save.
  if (label === null || point === null) throw new Error("Incomplete agenda address");
  return { label, ...point, precision: toPrecision(precision) };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getAgendaSettings(ownerId: string): Promise<AgendaSettingsView> {
  const row = await db.agendaSettings.findUnique({ where: { ownerId } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    home: toPlace(row.homeAddress, row.homePoint, row.homePrecision),
    office: toPlace(row.officeAddress, row.officePoint, row.officePrecision),
    workDays: row.workDays,
    dayStartMinutes: row.dayStartMin,
    dayEndMinutes: row.dayEndMin,
    dayEndLimitMinutes: row.dayEndLimitMin,
    defaultVisitMinutes: row.defaultVisitMin,
  };
}

function settingsColumns(input: AgendaSettingsInput) {
  const { home, office } = input;
  return {
    homeAddress: sealOrNull(home?.label),
    homePoint: home ? sealPoint(home) : null,
    homePrecision: home?.precision ?? null,
    officeAddress: sealOrNull(office?.label),
    officePoint: office ? sealPoint(office) : null,
    officePrecision: office?.precision ?? null,
    workDays: [...new Set(input.workDays)].sort((a, b) => a - b),
    dayStartMin: input.dayStartMinutes,
    dayEndMin: input.dayEndMinutes,
    dayEndLimitMin: input.dayEndLimitMinutes,
    defaultVisitMin: input.defaultVisitMinutes,
  };
}

export async function saveAgendaSettings(ownerId: string, input: AgendaSettingsInput): Promise<void> {
  const data = settingsColumns(input);
  await db.agendaSettings.upsert({
    where: { ownerId },
    create: { ownerId, ...data },
    update: { ...data, version: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Protected persons
// ---------------------------------------------------------------------------

const personInclude = { places: { where: { position: 0 }, take: 1 } } as const;

type PersonRow = Awaited<ReturnType<typeof findPersonRows>>[number];

function findPersonRows(ownerId: string) {
  return db.agendaContact.findMany({ where: { ownerId, category: "PROTEGE" }, include: personInclude });
}

function toPersonView(r: PersonRow): AgendaPersonView {
  const place = r.places[0];
  return {
    id: r.id,
    fullName: r.fullName,
    fromDossiers: r.dossierGroupKey !== null,
    address: place ? toPlace(place.address, place.point, place.precision) : null,
    visitsPerPeriod: r.visitsPerPeriod,
    visitPeriod: r.visitPeriod,
    visitMinutes: r.visitMin,
    notes: unseal(r.notes),
    lastVisitOn: r.lastVisitOn?.toISOString().slice(0, 10) ?? null,
    status: r.status,
    endReason: r.endReason,
  };
}

export async function listAgendaPersons(ownerId: string): Promise<AgendaPersonView[]> {
  const rows = await findPersonRows(ownerId);
  return rows.map(toPersonView).sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
}

/** Protected persons found in the owner's active dossiers and not yet in the agenda. */
export async function listImportablePersons(ownerId: string): Promise<DossierPerson[]> {
  const [dossiers, existing] = await Promise.all([
    db.dossier.findMany({
      where: { userId: ownerId, status: "ACTIVE" },
      select: { id: true, fullName: true, groupId: true, createdAt: true },
    }),
    db.agendaContact.findMany({ where: { ownerId, dossierGroupKey: { not: null } }, select: { dossierGroupKey: true } }),
  ]);
  const keys = new Set(existing.map((e) => e.dossierGroupKey).filter((k): k is string => k !== null));
  return personsFromDossiers(dossiers, keys);
}

/** Adds every importable person (default: 1 visit per quarter, address to fill in). */
export async function importPersonsFromDossiers(ownerId: string, actorId: string): Promise<number> {
  const persons = await listImportablePersons(ownerId);
  if (persons.length === 0) return 0;
  const data = persons.map((p) => ({
    ownerId,
    createdById: actorId,
    category: "PROTEGE" as const,
    fullName: p.fullName,
    dossierGroupKey: p.dossierGroupKey,
    visitsPerPeriod: 1,
    visitPeriod: "QUARTER" as const,
  }));
  return db.$transaction(async (tx) => {
    await assertRoomFor(tx, ownerId, data.length);
    return (await tx.agendaContact.createMany({ data, skipDuplicates: true })).count;
  }, TX_OPTIONS);
}

function personColumns(input: AgendaPersonInput) {
  return {
    fullName: input.fullName,
    visitsPerPeriod: input.visitsPerPeriod,
    visitPeriod: input.visitPeriod,
    visitMin: input.visitMinutes,
    notes: sealOrNull(input.notes),
    status: input.status,
    endReason: input.status === "ENDED" ? input.endReason : null,
  };
}

function placeColumns(ownerId: string, place: Place) {
  return { ownerId, label: HOME_PLACE_LABEL, address: seal(place.label), point: sealPoint(place), precision: place.precision, position: 0 };
}

/** Far above any real caseload (an MJPM follows ~50–80 persons): guards against runaway data. */
const MAX_PERSONS_PER_OWNER = 2000;

/** Errors whose message is safe and useful to show to the user (defined in bridge/errors, kept importable from here). */
export { AgendaRefusal };

const CAP_MESSAGE = `L'agenda est limité à ${MAX_PERSONS_PER_OWNER} personnes.`;
const PLACE_IN_USE_MESSAGE =
  "L'adresse de cette personne est le lieu d'un rendez-vous : changez d'abord le lieu de ce rendez-vous.";

/** Today at UTC midnight: agenda dates are calendar days, never the computer's local time. */
function todayUtc(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Checked inside the write transaction, so two simultaneous additions cannot both pass. */
async function assertRoomFor(tx: Tx, ownerId: string, added: number): Promise<void> {
  const count = await tx.agendaContact.count({ where: { ownerId, category: "PROTEGE" } });
  if (count + added > MAX_PERSONS_PER_OWNER) throw new AgendaRefusal(CAP_MESSAGE);
}

export async function createAgendaPerson(ownerId: string, actorId: string, input: AgendaPersonInput): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertRoomFor(tx, ownerId, 1);
    const contact = await tx.agendaContact.create({
      data: {
        ownerId,
        createdById: actorId,
        category: "PROTEGE",
        ...personColumns(input),
        endedOn: input.status === "ENDED" ? todayUtc() : null,
      },
    });
    if (input.address) await tx.agendaPlace.create({ data: { ...placeColumns(ownerId, input.address), contactId: contact.id } });
  });
}

/** False when the person does not exist in this owner's agenda. */
export async function updateAgendaPerson(ownerId: string, personId: string, input: AgendaPersonInput): Promise<boolean> {
  const existing = await db.agendaContact.findFirst({
    where: { id: personId, ownerId, category: "PROTEGE" },
    select: { status: true, endedOn: true },
  });
  if (!existing) return false;
  const endedOn = input.status !== "ENDED" ? null : existing.status === "ENDED" ? existing.endedOn : todayUtc();
  await db.$transaction(async (tx) => {
    const key = { id_ownerId: { id: personId, ownerId } };
    await tx.agendaContact.update({ where: key, data: { ...personColumns(input), endedOn } });
    await replaceDefaultPlace(tx, ownerId, personId, input.address);
  });
  return true;
}

/** Appointments held at one of these places (the database refuses to delete such a place). */
async function placesInUse(tx: Tx, ownerId: string, placeIds: string[]): Promise<boolean> {
  if (placeIds.length === 0) return false;
  return (await tx.agendaAppointment.count({ where: { ownerId, placeId: { in: placeIds } } })) > 0;
}

/** The person's default address (position 0), updated in place so appointments keep pointing at it. */
async function replaceDefaultPlace(tx: Tx, ownerId: string, contactId: string, address: Place | null): Promise<void> {
  const current = await tx.agendaPlace.findFirst({ where: { ownerId, contactId, position: 0 }, select: { id: true } });
  if (address === null) {
    if (!current) return;
    if (await placesInUse(tx, ownerId, [current.id])) throw new AgendaRefusal(PLACE_IN_USE_MESSAGE);
    await tx.agendaPlace.delete({ where: { id_ownerId: { id: current.id, ownerId } } });
    return;
  }
  const data = placeColumns(ownerId, address);
  if (current) await tx.agendaPlace.update({ where: { id_ownerId: { id: current.id, ownerId } }, data });
  else await tx.agendaPlace.create({ data: { ...data, contactId } });
}

const ERASED = "Contact supprimé";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every occurrence of the name, whatever its case (« jean bonneau », « JEAN BONNEAU »). */
function eraseName(text: string, fullName: string): string {
  const name = fullName.trim();
  return name ? text.replace(new RegExp(escapeRegExp(name), "gi"), ERASED) : text;
}

const ERASED_PLACE = { placeLabel: "", placeAddress: "", placePoint: null };

type Erasure = { contactId: string; fullName: string; homes: Set<string> };

/** The person's name leaves a title; their home leaves the place. */
function erasedFields(e: Erasure, row: { title: string; placeAddress: string }) {
  const title = eraseName(row.title, e.fullName);
  const address = unseal(row.placeAddress);
  return address !== null && e.homes.has(address) ? { title, ...ERASED_PLACE } : { title };
}

/** Appointment titles often name the person (« Signature chez le notaire pour Jean Bonneau »). */
async function scrubAppointmentTitles(tx: Tx, ownerId: string, e: Erasure): Promise<void> {
  const rows = await tx.agendaAppointment.findMany({
    where: { ownerId, participants: { some: { contactId: e.contactId } } },
    select: { id: true, title: true },
  });
  for (const row of rows) {
    const title = eraseName(row.title, e.fullName);
    if (title !== row.title) await tx.agendaAppointment.update({ where: { id_ownerId: { id: row.id, ownerId } }, data: { title } });
  }
}

/** Validated items and pins where the person was only a participant (pins of their own visits cascade). */
async function scrubParticipations(tx: Tx, ownerId: string, e: Erasure): Promise<void> {
  const select = { id: true, title: true, placeAddress: true } as const;
  const items = await tx.agendaItem.findMany({ where: { ownerId, participants: { some: { contactId: e.contactId } } }, select });
  for (const item of items) {
    await tx.agendaItem.update({ where: { id_ownerId: { id: item.id, ownerId } }, data: erasedFields(e, item) });
  }
  const pins = await tx.agendaPin.findMany({
    where: { ownerId, participantIds: { has: e.contactId } },
    select: { ...select, participantIds: true },
  });
  for (const pin of pins) {
    const participantIds = pin.participantIds.filter((id) => id !== e.contactId);
    await tx.agendaPin.updateMany({ where: { id: pin.id, ownerId }, data: { ...erasedFields(e, pin), participantIds } });
  }
}

/**
 * Deleting a contact erases it from the validated planning and the pins first
 * (principle 5 of the schema proposal): name, address and coordinates. Refused
 * while an appointment is held at the person's address.
 */
export async function deleteAgendaPerson(ownerId: string, personId: string): Promise<boolean> {
  const contact = await db.agendaContact.findFirst({
    where: { id: personId, ownerId },
    select: { id: true, fullName: true, places: { select: { id: true, address: true } } },
  });
  if (!contact) return false;
  await db.$transaction(async (tx) => {
    if (await placesInUse(tx, ownerId, contact.places.map((p) => p.id))) throw new AgendaRefusal(PLACE_IN_USE_MESSAGE);
    await tx.agendaContact.updateMany({ where: { ownerId, linkedContactId: personId }, data: { linkedContactId: null } });
    await tx.agendaItem.updateMany({ where: { ownerId, contactId: personId }, data: { contactId: null, title: ERASED, ...ERASED_PLACE } });
    const homes = new Set(contact.places.map((p) => unseal(p.address)).filter((a): a is string => a !== null));
    const erasure = { contactId: contact.id, fullName: contact.fullName, homes };
    await scrubParticipations(tx, ownerId, erasure);
    await scrubAppointmentTitles(tx, ownerId, erasure);
    await tx.agendaContact.delete({ where: { id_ownerId: { id: personId, ownerId } } });
  }, TX_OPTIONS);
  return true;
}
