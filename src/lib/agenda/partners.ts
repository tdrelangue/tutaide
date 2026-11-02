import { db } from "@/lib/db";
import type { Tx } from "./bridge/lock";
import { AgendaRefusal } from "./bridge/errors";
import { assertGroupInScope, contactGroupTags, listGroups, partnerWhere, type AddressBook } from "./groups";
import { groupOf, type GroupTag } from "./groups-rules";
import { syncPartnerContacts } from "./partner-contacts";
import { sealOrNull, sealPoint, unseal } from "./sealed";
import { toPlace, type Place } from "./service";
import type { AgendaPartnerInput } from "./validation";

/**
 * « Contacts »: the partners' address book (Thomas, 2026-11-02) — lawyers,
 * notaries, craftsmen… Shared by the whole structure; an account without a
 * structure has its own. Phones, e-mail, address and notes are encrypted.
 */

export type AgendaPartnerView = {
  id: string;
  /** Null = the first group of partners. */
  groupId: string | null;
  civility: string | null;
  lastName: string | null;
  firstName: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: Place | null;
  notes: string | null;
  hours: { dows: number[]; fromMin: number; toMin: number }[];
  /** Persons of the current agenda this contact works for (« notaire de Jean Bonneau »). */
  linkedPersonIds: string[];
};

/** Far above any real address book: guards against runaway data. */
const MAX_PARTNERS_PER_BOOK = 5000;

/** The address book the MJPM's agenda reads: their structure's, or their own without a structure. */
export async function addressBookOf(ownerId: string): Promise<AddressBook> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { orgId: true } });
  return owner?.orgId ? { orgId: owner.orgId } : { userId: ownerId };
}

const partnersScope = (book: AddressBook) => ({ kind: "PARTNERS" as const, book });

type PartnerRow = Awaited<ReturnType<typeof partnerRows>>[number];

/** `ownerId`: the agenda whose links to persons are read (links are per agenda). */
function partnerRows(book: AddressBook, ownerId: string) {
  return db.agendaPartner.findMany({
    where: partnerWhere(book),
    include: {
      hours: { select: { dows: true, fromMin: true, toMin: true }, orderBy: { fromMin: "asc" } },
      links: { where: { ownerId }, select: { contactId: true } },
    },
  });
}

function toView(r: PartnerRow): AgendaPartnerView {
  return {
    id: r.id,
    groupId: r.groupId,
    civility: r.civility,
    lastName: r.lastName,
    firstName: r.firstName,
    company: r.company,
    role: r.role,
    phone: unseal(r.phone),
    mobile: unseal(r.mobile),
    email: unseal(r.email),
    address: toPlace(r.address, r.point, r.precision),
    notes: unseal(r.notes),
    hours: r.hours,
    linkedPersonIds: r.links.map((l) => l.contactId),
  };
}

/** « TERIEUR Alex », else the structure: the sort key of the list. */
function sortKey(p: AgendaPartnerView): string {
  return [p.lastName, p.firstName, p.company].filter((s) => s !== null).join(" ");
}

export async function listPartners(book: AddressBook, ownerId: string): Promise<AgendaPartnerView[]> {
  const rows = await partnerRows(book, ownerId);
  return rows.map(toView).sort((a, b) => sortKey(a).localeCompare(sortKey(b), "fr"));
}

function partnerColumns(input: AgendaPartnerInput) {
  const { address } = input;
  return {
    groupId: input.groupId,
    civility: input.civility,
    lastName: input.lastName,
    firstName: input.firstName,
    company: input.company,
    role: input.role,
    phone: sealOrNull(input.phone),
    mobile: sealOrNull(input.mobile),
    email: sealOrNull(input.email),
    address: sealOrNull(address?.label),
    point: address ? sealPoint(address) : null,
    precision: address?.precision ?? null,
    notes: sealOrNull(input.notes),
  };
}

const bookColumns = (book: AddressBook) => ("orgId" in book ? { orgId: book.orgId } : { userId: book.userId });

/** Hours replaced; links replaced for this agenda only (other agendas keep theirs). */
async function writeHoursAndLinks(tx: Tx, ownerId: string, partnerId: string, input: AgendaPartnerInput): Promise<void> {
  await tx.agendaPartnerHours.deleteMany({ where: { partnerId } });
  if (input.hours.length > 0) {
    const hours = input.hours.map((h) => ({ partnerId, dows: [...new Set(h.dows)].sort((a, b) => a - b), fromMin: h.fromMin, toMin: h.toMin }));
    await tx.agendaPartnerHours.createMany({ data: hours });
  }
  const wanted = [...new Set(input.linkedPersonIds)];
  const persons = await tx.agendaContact.findMany({ where: { ownerId, category: "PROTEGE", id: { in: wanted } }, select: { id: true } });
  if (persons.length !== wanted.length) throw new AgendaRefusal("Une des personnes liées n'existe plus.");
  await tx.agendaPartnerLink.deleteMany({ where: { partnerId, ownerId } });
  if (persons.length > 0) await tx.agendaPartnerLink.createMany({ data: persons.map((p) => ({ partnerId, contactId: p.id, ownerId })) });
}

/** `ownerId`: the agenda whose persons may be linked. */
export async function createPartner(book: AddressBook, ownerId: string, actorId: string, input: AgendaPartnerInput): Promise<string> {
  return db.$transaction(async (tx) => {
    if ((await tx.agendaPartner.count({ where: partnerWhere(book) })) >= MAX_PARTNERS_PER_BOOK) {
      throw new AgendaRefusal(`Le carnet est limité à ${MAX_PARTNERS_PER_BOOK} contacts.`);
    }
    await assertGroupInScope(tx, partnersScope(book), input.groupId);
    const created = await tx.agendaPartner.create({
      data: { ...bookColumns(book), createdById: actorId, ...partnerColumns(input) },
      select: { id: true },
    });
    await writeHoursAndLinks(tx, ownerId, created.id, input);
    return created.id;
  });
}

/** False when the partner is not in this address book. */
export async function updatePartner(book: AddressBook, ownerId: string, partnerId: string, input: AgendaPartnerInput): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (!(await tx.agendaPartner.findFirst({ where: { ...partnerWhere(book), id: partnerId }, select: { id: true } }))) return false;
    await assertGroupInScope(tx, partnersScope(book), input.groupId);
    await tx.agendaPartner.update({ where: { id: partnerId }, data: partnerColumns(input) });
    await writeHoursAndLinks(tx, ownerId, partnerId, input);
    // Every agenda that uses this contact reads the new name, hours and address.
    await syncPartnerContacts(tx, partnerId);
    return true;
  });
}

/** False when the partner is not in this address book. */
export async function deletePartner(book: AddressBook, partnerId: string): Promise<boolean> {
  const { count } = await db.agendaPartner.deleteMany({ where: { ...partnerWhere(book), id: partnerId } });
  return count > 0;
}

/** Contact id -> group, for the blocks of the week: persons to visit, and contacts of the address book. */
export async function agendaGroupTags(ownerId: string): Promise<ReadonlyMap<string, GroupTag>> {
  const book = await addressBookOf(ownerId);
  const [persons, groups, contacts] = await Promise.all([
    contactGroupTags(ownerId),
    listGroups({ kind: "PARTNERS", book }),
    db.agendaContact.findMany({ where: { ownerId, partnerId: { not: null } }, select: { id: true, partner: { select: { groupId: true } } } }),
  ]);
  const tags = new Map(persons);
  for (const c of contacts) {
    const tag = c.partner ? groupOf(c.partner.groupId, groups) : null;
    if (tag) tags.set(c.id, tag);
  }
  return tags;
}
