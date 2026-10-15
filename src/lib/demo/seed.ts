import fs from "fs/promises";
import path from "path";
import type { ModuleType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
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

type DemoVisit = { label: string; lat: number; lon: number; visits: number; period: "MONTH" | "QUARTER"; notes?: string };

/** « Agenda » add-on: invented places around Lille (town-centre coordinates). Sophie Stiqué has no address on purpose. */
const AGENDA_VISITS: Record<string, DemoVisit> = {
  "Jean Bonneau": { label: "Résidence Les Tilleuls, 59100 Roubaix", lat: 50.6907, lon: 3.1746, visits: 1, period: "MONTH" },
  "Alain Térieur": { label: "8 allée des Peupliers, 59200 Tourcoing", lat: 50.7236, lon: 3.1612, visits: 1, period: "QUARTER" },
  "Aude Javel": { label: "EHPAD Le Clos Fleuri, 59650 Villeneuve-d'Ascq", lat: 50.6233, lon: 3.1446, visits: 2, period: "MONTH", notes: "Pas avant 10 h (toilette)." },
  "Marc Assin": { label: "21 rue des Écoles, 59130 Lambersart", lat: 50.6497, lon: 3.0254, visits: 1, period: "QUARTER" },
  "Annie Versaire": { label: "Foyer Saint-Joseph, 59700 Marcq-en-Barœul", lat: 50.6719, lon: 3.0961, visits: 1, period: "QUARTER" },
  "Paul Ochon": { label: "5 place du Marché, 59280 Armentières", lat: 50.688, lon: 2.8808, visits: 1, period: "QUARTER", notes: "Appeler la veille." },
};

const DEMO_HOME = { label: "Place du Théâtre, 59000 Lille", lat: 50.6372, lon: 3.0633 };

/** One protected person with their default address (position 0), encrypted like real data. */
async function seedAgendaPerson(ownerId: string, fullName: string, dossierGroupKey: string | null, visit: DemoVisit | undefined): Promise<void> {
  const contact = await db.agendaContact.create({
    data: {
      ownerId,
      category: "PROTEGE",
      fullName,
      dossierGroupKey,
      visitsPerPeriod: visit?.visits ?? 1,
      visitPeriod: visit?.period ?? "QUARTER",
      notes: visit?.notes ? encrypt(visit.notes) : null,
    },
  });
  if (!visit) return;
  await db.agendaPlace.create({
    data: {
      ownerId,
      contactId: contact.id,
      label: "Domicile",
      address: encrypt(visit.label),
      lat: visit.lat,
      lon: visit.lon,
      precision: "housenumber",
    },
  });
}

async function seedAgenda(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { agendaGranted: true } });
  await db.agendaSettings.create({
    data: {
      ownerId: userId,
      homeAddress: encrypt(DEMO_HOME.label),
      homeLat: DEMO_HOME.lat,
      homeLon: DEMO_HOME.lon,
      homePrecision: "housenumber",
    },
  });
  const dossiers = await db.dossier.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, fullName: true } });
  for (const d of dossiers) await seedAgendaPerson(userId, d.fullName, d.id, AGENDA_VISITS[d.fullName]);
  await seedAgendaPerson(userId, "Pierre Kiroul", null, {
    label: "Résidence du Parc, 59113 Seclin",
    lat: 50.5486,
    lon: 3.0294,
    visits: 1,
    period: "QUARTER",
  });
}

/** Fills a new demo account. The account itself is created by startDemo. */
export async function seedDemoAccount(userId: string): Promise<void> {
  await seedGlobalTemplates();
  await seedMailboxAndModules(userId);
  const events: Prisma.EmailSendEventCreateManyInput[] = [];
  for (const spec of DOSSIERS) events.push(...(await seedDossier(userId, spec)));
  await db.emailSendEvent.createMany({ data: events });
  await seedAgenda(userId);
}
