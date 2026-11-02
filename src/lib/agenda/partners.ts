import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";
import { assertGroupInScope, partnerWhere, type AddressBook } from "./groups";
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

function partnerRows(book: AddressBook) {
  return db.agendaPartner.findMany({ where: partnerWhere(book) });
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
  };
}

/** « TERIEUR Alex », else the structure: the sort key of the list. */
function sortKey(p: AgendaPartnerView): string {
  return [p.lastName, p.firstName, p.company].filter((s) => s !== null).join(" ");
}

export async function listPartners(book: AddressBook): Promise<AgendaPartnerView[]> {
  const rows = await partnerRows(book);
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

export async function createPartner(book: AddressBook, actorId: string, input: AgendaPartnerInput): Promise<void> {
  await db.$transaction(async (tx) => {
    if ((await tx.agendaPartner.count({ where: partnerWhere(book) })) >= MAX_PARTNERS_PER_BOOK) {
      throw new AgendaRefusal(`Le carnet est limité à ${MAX_PARTNERS_PER_BOOK} contacts.`);
    }
    await assertGroupInScope(tx, partnersScope(book), input.groupId);
    await tx.agendaPartner.create({ data: { ...bookColumns(book), createdById: actorId, ...partnerColumns(input) } });
  });
}

/** False when the partner is not in this address book. */
export async function updatePartner(book: AddressBook, partnerId: string, input: AgendaPartnerInput): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (!(await tx.agendaPartner.findFirst({ where: { ...partnerWhere(book), id: partnerId }, select: { id: true } }))) return false;
    await assertGroupInScope(tx, partnersScope(book), input.groupId);
    await tx.agendaPartner.update({ where: { id: partnerId }, data: partnerColumns(input) });
    return true;
  });
}

/** False when the partner is not in this address book. */
export async function deletePartner(book: AddressBook, partnerId: string): Promise<boolean> {
  const { count } = await db.agendaPartner.deleteMany({ where: { ...partnerWhere(book), id: partnerId } });
  return count > 0;
}
