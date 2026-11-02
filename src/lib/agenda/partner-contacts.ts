import { AgendaRefusal } from "./bridge/errors";
import type { Tx } from "./bridge/lock";
import { partnerWhere, type AddressBook } from "./groups";
import { partnerName } from "./rules";

/**
 * A partner of the shared address book, inside one MJPM's agenda. The planner,
 * the participants and the places all read one owner's contacts (composite
 * keys), so a partner used in an agenda gets a contact there (category PRO,
 * `partnerId`), kept in step with the partner: name, hours, address.
 */

/** Label of the partner's address as an appointment place. */
const OFFICE_LABEL = "Cabinet";

const PARTNER_FOR_CONTACT = {
  id: true,
  civility: true,
  firstName: true,
  lastName: true,
  company: true,
  role: true,
  address: true,
  point: true,
  precision: true,
  hours: { select: { dows: true, fromMin: true, toMin: true } },
} as const;

type PartnerForContact = {
  id: string;
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  role: string | null;
  address: string | null;
  point: string | null;
  precision: string | null;
  hours: { dows: number[]; fromMin: number; toMin: number }[];
};

function contactRole(p: PartnerForContact): string | null {
  const parts = [p.role, p.lastName ? p.company : null].filter((s): s is string => s !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The contact's address: the partner's (already encrypted), updated in place so appointments keep it. */
async function syncPlace(tx: Tx, ownerId: string, contactId: string, p: PartnerForContact): Promise<void> {
  const current = await tx.agendaPlace.findFirst({ where: { ownerId, contactId, position: 0 }, select: { id: true } });
  if (p.address === null || p.point === null) {
    // An address still used by an appointment stays: the appointment keeps its place.
    if (current && (await tx.agendaAppointment.count({ where: { ownerId, placeId: current.id } })) === 0) {
      await tx.agendaPlace.delete({ where: { id: current.id } });
    }
    return;
  }
  const label = p.company ?? OFFICE_LABEL;
  const data = { label, address: p.address, point: p.point, precision: p.precision };
  if (current) await tx.agendaPlace.update({ where: { id: current.id }, data });
  else await tx.agendaPlace.create({ data: { ...data, ownerId, contactId, position: 0 } });
}

async function syncContact(tx: Tx, contact: { id: string; ownerId: string }, p: PartnerForContact): Promise<void> {
  await tx.agendaContact.update({ where: { id: contact.id }, data: { fullName: partnerName(p), role: contactRole(p) } });
  await tx.agendaAvailability.deleteMany({ where: { contactId: contact.id } });
  if (p.hours.length > 0) {
    await tx.agendaAvailability.createMany({ data: p.hours.map((h) => ({ contactId: contact.id, ...h })) });
  }
  await syncPlace(tx, contact.ownerId, contact.id, p);
}

/** After a partner is edited: every agenda using it reads the new name, hours and address. */
export async function syncPartnerContacts(tx: Tx, partnerId: string): Promise<void> {
  const partner = await tx.agendaPartner.findUnique({ where: { id: partnerId }, select: PARTNER_FOR_CONTACT });
  if (!partner) return;
  const contacts = await tx.agendaContact.findMany({ where: { partnerId }, select: { id: true, ownerId: true } });
  for (const contact of contacts) await syncContact(tx, contact, partner);
}

/** The partner's contact in this agenda, created on first use. Refused for a partner of another address book. */
export async function ensurePartnerContact(tx: Tx, ownerId: string, book: AddressBook, partnerId: string): Promise<string> {
  const partner = await tx.agendaPartner.findFirst({ where: { ...partnerWhere(book), id: partnerId }, select: PARTNER_FOR_CONTACT });
  if (!partner) throw new AgendaRefusal("Un des contacts n'existe plus.");
  const existing = await tx.agendaContact.findFirst({ where: { ownerId, partnerId }, select: { id: true, ownerId: true } });
  const contact =
    existing ??
    (await tx.agendaContact.create({
      data: { ownerId, category: "PRO", partnerId, fullName: partnerName(partner) },
      select: { id: true, ownerId: true },
    }));
  await syncContact(tx, contact, partner);
  return contact.id;
}

/** « Au cabinet du contact »: the place of the partner's address in this agenda. */
export async function partnerOfficePlace(tx: Tx, ownerId: string, contactId: string): Promise<string> {
  const place = await tx.agendaPlace.findFirst({ where: { ownerId, contactId, position: 0 }, select: { id: true } });
  if (!place) throw new AgendaRefusal("Ce contact n'a pas d'adresse : renseignez-la dans sa fiche, ou choisissez un autre lieu.");
  return place.id;
}
