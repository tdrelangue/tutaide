import fs from "fs/promises";
import path from "path";
import type { ModuleType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { addDays, isoDow, nextWeek } from "@/lib/agenda-engine/domain";
import type { IsoDate, Place, ValidatedItem } from "@/lib/agenda-engine/domain";
import { fromIso, todayIn } from "@/lib/agenda/bridge/dates";
import { itemRow } from "@/lib/agenda/bridge/map";
import { sealPoint } from "@/lib/agenda/sealed";
import { seedGlobalTemplates } from "@/lib/default-templates";
import { getDemoDocumentsDir } from "./state";

/**
 * Fictional content of a demo account: a mailbox, the three modules, a few
 * dossiers with documents and a sending history. Every name and address is
 * invented; ".exemple" is not a real domain and nothing is ever sent anyway.
 * Runs on the in-memory demo database (db is routed there during a demo).
 */

/** Filed documents, from public/demo/dossiers (see docs/demo/generate_demo_pdfs.cjs). */
const SEED_DOCS_DIR = path.join(process.cwd(), "public", "demo", "dossiers");

type DemoDossier = {
  fullName: string;
  moduleType: ModuleType;
  priority?: "NORMAL" | "PRIORITAIRE" | "URGENT";
  status?: "ACTIVE" | "CLOSED";
  documents?: string[];
  sentDaysAgo?: number[];
};

const DOSSIERS: DemoDossier[] = [
  { fullName: "Jean Bonneau", moduleType: "APA", documents: ["Justificatifs_Jean_Bonneau.pdf"], sentDaysAgo: [95] },
  { fullName: "Alain Térieur", moduleType: "APA", priority: "PRIORITAIRE", documents: ["Releve_compte_Alain_Terieur_T3.pdf"], sentDaysAgo: [92] },
  { fullName: "Aude Javel", moduleType: "APA", priority: "URGENT" },
  { fullName: "Marc Assin", moduleType: "APA" },
  { fullName: "Jacques Célère", moduleType: "APA", status: "CLOSED" },
  { fullName: "Annie Versaire", moduleType: "ASH", documents: ["ASH_Versaire_T2_2026.pdf"], sentDaysAgo: [88] },
  { fullName: "Paul Ochon", moduleType: "ASH" },
  { fullName: "Sophie Stiqué", moduleType: "PCH", priority: "PRIORITAIRE" },
];

const DESTINATIONS: Record<"APA" | "ASH" | "PCH", string> = {
  APA: "service.apa@departement.exemple",
  ASH: "aide.sociale@departement.exemple",
  PCH: "mdph@departement.exemple",
};

async function seedMailboxAndModules(userId: string): Promise<void> {
  await db.smtpConfig.create({
    data: {
      provider: "GMAIL",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      username: "claire.delune@cabinet.exemple",
      encryptedPassword: encrypt("demonstration"),
      fromName: "Claire Delune",
      fromEmail: "claire.delune@cabinet.exemple",
      userId,
    },
  });
  await db.moduleConfig.createMany({
    data: (Object.keys(DESTINATIONS) as Array<keyof typeof DESTINATIONS>).map((moduleType) => ({
      moduleType,
      destinationEmail: DESTINATIONS[moduleType],
      imapFolder: `INBOX/${moduleType}`,
      userId,
    })),
  });
}

async function defaultTemplateId(moduleType: ModuleType): Promise<string | null> {
  const template = await db.emailTemplate.findFirst({
    where: { isGlobal: true, isDefault: true, category: moduleType },
    select: { id: true },
  });
  return template?.id ?? null;
}

async function seedDocument(userId: string, dossierId: string, filename: string) {
  const dir = path.join(getDemoDocumentsDir(), userId, dossierId);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${Date.now()}-${filename}`);
  await fs.copyFile(path.join(SEED_DOCS_DIR, filename), target);
  const { size } = await fs.stat(target);
  return db.document.create({ data: { filename, blobUrl: target, size, userId, dossierId } });
}

function sentEvent(userId: string, dossier: { id: string; fullName: string }, moduleType: ModuleType, daysAgo: number): Prisma.EmailSendEventCreateManyInput {
  const sentAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  return {
    status: "SENT",
    moduleType,
    recipients: [DESTINATIONS[moduleType as keyof typeof DESTINATIONS]],
    subject: `${moduleType} – ${dossier.fullName} – envoi trimestriel`,
    body: `Madame, Monsieur,\n\nVeuillez trouver ci-joint les justificatifs de ${dossier.fullName}.\n\nClaire Delune`,
    createdAt: sentAt,
    sentAt,
    userId,
    dossierId: dossier.id,
  };
}

async function seedDossier(userId: string, spec: DemoDossier): Promise<Prisma.EmailSendEventCreateManyInput[]> {
  const dossier = await db.dossier.create({
    data: {
      fullName: spec.fullName,
      moduleType: spec.moduleType,
      priority: spec.priority ?? "NORMAL",
      status: spec.status ?? "ACTIVE",
      userId,
      defaultTemplateId: await defaultTemplateId(spec.moduleType),
    },
  });
  for (const filename of spec.documents ?? []) await seedDocument(userId, dossier.id, filename);
  return (spec.sentDaysAgo ?? []).map((days) => sentEvent(userId, dossier, spec.moduleType, days));
}

type DemoVisit = {
  label: string;
  lat: number;
  lon: number;
  visits: number;
  period: "MONTH" | "QUARTER";
  notes?: string;
  /** Days since the last visit on file; absent = unknown (the agenda proposes the visit right away). */
  seenDaysAgo?: number;
  priority?: "LOW" | "NORMAL" | "HIGH" | "MUST";
  /** Not available before this time (minutes). */
  notBeforeMin?: number;
  /** Only available on these ISO weekdays, between these times (minutes). */
  availability?: { dows: number[]; from: number; to: number };
};

/** « Agenda » add-on: invented places around Lille (town-centre coordinates). Sophie Stiqué has no address on purpose. */
const AGENDA_VISITS: Record<string, DemoVisit> = {
  "Jean Bonneau": { label: "Résidence Les Tilleuls, 59100 Roubaix", lat: 50.6907, lon: 3.1746, visits: 1, period: "MONTH", seenDaysAgo: 24 },
  "Alain Térieur": {
    label: "8 allée des Peupliers, 59200 Tourcoing",
    lat: 50.7236,
    lon: 3.1612,
    visits: 1,
    period: "QUARTER",
    notes: "Accueil de jour la semaine : disponible le mercredi après-midi seulement.",
    seenDaysAgo: 86,
    priority: "HIGH",
    availability: { dows: [3], from: 14 * 60, to: 17 * 60 },
  },
  "Aude Javel": {
    label: "EHPAD Le Clos Fleuri, 59650 Villeneuve-d'Ascq",
    lat: 50.6233,
    lon: 3.1446,
    visits: 2,
    period: "MONTH",
    notes: "Pas avant 10 h (toilette).",
    seenDaysAgo: 21,
    priority: "HIGH",
    notBeforeMin: 600,
  },
  "Marc Assin": { label: "21 rue des Écoles, 59130 Lambersart", lat: 50.6497, lon: 3.0254, visits: 1, period: "QUARTER", seenDaysAgo: 97 },
  "Annie Versaire": { label: "Foyer Saint-Joseph, 59700 Marcq-en-Barœul", lat: 50.6719, lon: 3.0961, visits: 1, period: "QUARTER", seenDaysAgo: 40 },
  "Paul Ochon": { label: "5 place du Marché, 59280 Armentières", lat: 50.688, lon: 2.8808, visits: 1, period: "QUARTER", notes: "Appeler la veille.", seenDaysAgo: 88 },
};

/** People of the agenda who have no dossier in the demo. Pierre Kiroul has no last visit on file: the agenda proposes the visit right away. */
const AGENDA_ONLY: Record<string, DemoVisit> = {
  "Pierre Kiroul": { label: "Résidence du Parc, 59113 Seclin", lat: 50.5486, lon: 3.0294, visits: 1, period: "QUARTER" },
  "Théo Rème": { label: "34 rue Jean Jaurès, 59150 Wattrelos", lat: 50.7036, lon: 3.2183, visits: 1, period: "MONTH", seenDaysAgo: 28 },
  "Anne Anasse": { label: "Résidence Les Lilas, 59260 Hellemmes-Lille", lat: 50.6288, lon: 3.1056, visits: 1, period: "MONTH", seenDaysAgo: 33 },
};

const DEMO_HOME = { label: "Place du Théâtre, 59000 Lille", lat: 50.6372, lon: 3.0633 };
const DEMO_TIMEZONE = "Europe/Paris";
/** Wednesday afternoon starts when the default lunch break (12:30–13:30) ends. */
const AFTERNOON_START = 810;
const AFTERNOON_END = 1080;

/** A protected person as the agenda demo needs them: id, name and the home they are visited at. */
type DemoPerson = { id: string; name: string; home: Place };

/** One protected person with their default address (position 0), encrypted like real data. */
async function seedAgendaPerson(ownerId: string, fullName: string, dossierGroupKey: string | null, visit: DemoVisit | undefined, today: IsoDate): Promise<DemoPerson> {
  const contact = await db.agendaContact.create({
    data: {
      ownerId,
      category: "PROTEGE",
      fullName,
      dossierGroupKey,
      visitsPerPeriod: visit?.visits ?? 1,
      visitPeriod: visit?.period ?? "QUARTER",
      visitPriority: visit?.priority ?? null,
      notBeforeMin: visit?.notBeforeMin ?? null,
      lastVisitOn: visit?.seenDaysAgo === undefined ? null : fromIso(addDays(today, -visit.seenDaysAgo)),
      notes: visit?.notes ? encrypt(visit.notes) : null,
    },
  });
  const home: Place = { id: `home:${contact.id}`, label: "Domicile", address: visit?.label ?? "", lat: visit?.lat ?? 0, lon: visit?.lon ?? 0 };
  if (!visit) return { id: contact.id, name: fullName, home };
  await seedAvailability(contact.id, visit);
  await db.agendaPlace.create({
    data: {
      ownerId,
      contactId: contact.id,
      label: "Domicile",
      address: encrypt(visit.label),
      point: sealPoint(visit),
      precision: "housenumber",
    },
  });
  return { id: contact.id, name: fullName, home };
}

async function seedAvailability(contactId: string, visit: DemoVisit): Promise<void> {
  if (!visit.availability) return;
  const { dows, from, to } = visit.availability;
  await db.agendaAvailability.create({ data: { contactId, dows, fromMin: from, toMin: to } });
}

type DemoFreePlace = { label: string; address: string; lat: number; lon: number };

/** A place that belongs to no one (a court, a notary): address and point sealed like the others. */
async function seedFreePlace(ownerId: string, place: DemoFreePlace): Promise<string> {
  const row = await db.agendaPlace.create({
    data: { ownerId, label: place.label, address: encrypt(place.address), point: sealPoint(place), precision: "housenumber" },
  });
  return row.id;
}

/** « Mes créneaux »: one « Important » rule worth a question and one imperative closure. */
async function seedAgendaRules(ownerId: string): Promise<void> {
  await db.agendaRule.createMany({
    data: [
      { ownerId, type: "UNAVAILABLE", label: "Mercredi après-midi : enfants", strength: "STRONG", dow: 3, allDay: false, fromMin: AFTERNOON_START, toMin: AFTERNOON_END },
      { ownerId, type: "UNAVAILABLE", label: "Journée au bureau", strength: "HARD", dow: 5, allDay: true },
    ],
  });
}

/** The working day on or before `daysAgo` days back: a past week never shows a Sunday visit. */
function workdayAgo(today: IsoDate, daysAgo: number): IsoDate {
  let date = addDays(today, -daysAgo);
  while (isoDow(date) > 5) date = addDays(date, -1);
  return date;
}

async function seedValidatedItem(ownerId: string, item: ValidatedItem): Promise<void> {
  const participants = item.participants.map((contactId) => ({ contactId }));
  await db.agendaItem.create({ data: { ...itemRow(item, ownerId), participants: { create: participants } } });
}

function pastVisit(person: DemoPerson, date: IsoDate, start: number): ValidatedItem {
  return {
    id: `${person.id}@${date}`,
    apptId: null,
    kind: "VISIT",
    title: `Visite à ${person.name}`,
    participants: [person.id],
    personId: person.id,
    place: person.home,
    dur: 60,
    date,
    start,
    end: start + 60,
    priority: "NORMAL",
    earliest: date,
    latest: date,
    fixed: false,
    movable: false,
    moved: false,
  };
}

/** A fixed-time appointment already held at the office, validated: shows up in « Ces rendez-vous ont-ils eu lieu ? ». */
async function seedPastBankAppointment(ownerId: string, person: DemoPerson, date: IsoDate): Promise<void> {
  const start = 14 * 60;
  const appointment = await db.agendaAppointment.create({
    data: {
      ownerId,
      title: "Rendez-vous à la banque",
      placeKind: "OFFICE",
      durationMin: 45,
      whenKind: "FIXED",
      date: fromIso(date),
      timeMin: start,
      priority: "NORMAL",
      participants: { create: [{ contactId: person.id }] },
    },
  });
  const office: Place = { id: "office", label: "Bureau", address: DEMO_HOME.label, lat: DEMO_HOME.lat, lon: DEMO_HOME.lon };
  await seedValidatedItem(ownerId, {
    ...pastVisit(person, date, start),
    id: appointment.id,
    apptId: appointment.id,
    kind: "APPT",
    title: "Rendez-vous à la banque",
    place: office,
    dur: 45,
    end: start + 45,
    fixed: true,
  });
}

/** Last week, validated: a few visits and an appointment to confirm. */
async function seedValidatedPast(ownerId: string, today: IsoDate, people: ReadonlyMap<string, DemoPerson>): Promise<void> {
  const jean = people.get("Jean Bonneau");
  const marc = people.get("Marc Assin");
  const annie = people.get("Annie Versaire");
  if (jean) await seedValidatedItem(ownerId, pastVisit(jean, workdayAgo(today, 5), 10 * 60));
  if (annie) await seedValidatedItem(ownerId, pastVisit(annie, workdayAgo(today, 2), 9 * 60 + 30));
  if (marc) await seedPastBankAppointment(ownerId, marc, workdayAgo(today, 3));
}

/** Next week: a notary signature to place (Alain Térieur) and a hearing at a fixed time (Marc Assin). */
async function seedNextWeekAppointments(ownerId: string, today: IsoDate, people: ReadonlyMap<string, DemoPerson>): Promise<void> {
  const week = nextWeek(today);
  const tribunal = await seedFreePlace(ownerId, { label: "Tribunal judiciaire de Lille", address: "13 avenue du Peuple Belge, 59800 Lille", lat: 50.6417, lon: 3.0668 });
  const notaire = await seedFreePlace(ownerId, { label: "Étude de Maître Tabellion", address: "12 rue des Actes, 59000 Lille", lat: 50.635, lon: 3.061 });
  const alain = people.get("Alain Térieur");
  const marc = people.get("Marc Assin");
  await db.agendaAppointment.create({
    data: {
      ownerId,
      title: "Signature chez le notaire",
      placeKind: "PLACE",
      placeId: notaire,
      durationMin: 90,
      whenKind: "WEEK",
      fromDate: fromIso(week.from),
      toDate: fromIso(week.to),
      priority: "HIGH",
      participants: { create: alain ? [{ contactId: alain.id }] : [] },
    },
  });
  await db.agendaAppointment.create({
    data: {
      ownerId,
      title: "Audience au tribunal",
      placeKind: "PLACE",
      placeId: tribunal,
      durationMin: 90,
      whenKind: "FIXED",
      date: fromIso(addDays(week.from, 1)),
      timeMin: 14 * 60,
      priority: "MUST",
      participants: { create: marc ? [{ contactId: marc.id }] : [] },
    },
  });
}

/**
 * The agenda of the demo account, relative to `now` (the demo's start): visits
 * due around next week, a question to answer (Wednesday afternoon), a closed
 * Friday, two appointments next week and a validated last week to confirm.
 */
async function seedAgenda(userId: string, now: Date): Promise<void> {
  const today = todayIn(DEMO_TIMEZONE, now);
  await db.user.update({ where: { id: userId }, data: { agendaGranted: true } });
  await db.agendaSettings.create({
    data: {
      ownerId: userId,
      homeAddress: encrypt(DEMO_HOME.label),
      homePoint: sealPoint(DEMO_HOME),
      homePrecision: "housenumber",
    },
  });
  const dossiers = await db.dossier.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, fullName: true } });
  const people = new Map<string, DemoPerson>();
  for (const d of dossiers) people.set(d.fullName, await seedAgendaPerson(userId, d.fullName, d.id, AGENDA_VISITS[d.fullName], today));
  for (const [name, visit] of Object.entries(AGENDA_ONLY)) people.set(name, await seedAgendaPerson(userId, name, null, visit, today));
  await seedAgendaRules(userId);
  await seedNextWeekAppointments(userId, today, people);
  await seedValidatedPast(userId, today, people);
}

/** Fills a new demo account. The account itself is created by startDemo. */
export async function seedDemoAccount(userId: string): Promise<void> {
  await seedGlobalTemplates();
  await seedMailboxAndModules(userId);
  const events: Prisma.EmailSendEventCreateManyInput[] = [];
  for (const spec of DOSSIERS) events.push(...(await seedDossier(userId, spec)));
  await db.emailSendEvent.createMany({ data: events });
  await seedAgenda(userId, new Date());
}
