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
  { fullName: "Jeanne Martin", moduleType: "APA", documents: ["Justificatifs_Jeanne_Martin.pdf"], sentDaysAgo: [95] },
  { fullName: "Lucien Bernard", moduleType: "APA", priority: "PRIORITAIRE", documents: ["Releve_compte_Lucien_Bernard_T3.pdf"], sentDaysAgo: [92] },
  { fullName: "Odette Lefèvre", moduleType: "APA", priority: "URGENT" },
  { fullName: "Marcel Fournier", moduleType: "APA" },
  { fullName: "Georges Vidal", moduleType: "APA", status: "CLOSED" },
  { fullName: "Hélène Garnier", moduleType: "ASH", documents: ["ASH_Garnier_T2_2026.pdf"], sentDaysAgo: [88] },
  { fullName: "Robert Lemaire", moduleType: "ASH" },
  { fullName: "Sophie Moreau", moduleType: "PCH", priority: "PRIORITAIRE" },
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
      username: "marie.dupont@cabinet.exemple",
      encryptedPassword: encrypt("demonstration"),
      fromName: "Marie Dupont",
      fromEmail: "marie.dupont@cabinet.exemple",
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
    body: `Madame, Monsieur,\n\nVeuillez trouver ci-joint les justificatifs de ${dossier.fullName}.\n\nMarie Dupont`,
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

/** Fills a new demo account. The account itself is created by startDemo. */
export async function seedDemoAccount(userId: string): Promise<void> {
  await seedGlobalTemplates();
  await seedMailboxAndModules(userId);
  const events: Prisma.EmailSendEventCreateManyInput[] = [];
  for (const spec of DOSSIERS) events.push(...(await seedDossier(userId, spec)));
  await db.emailSendEvent.createMany({ data: events });
}
