import type { ModuleType, SmtpProvider } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { smtpConfigSchema, type SmtpConfigFormData } from "@/lib/validations";
import type { OrgRoleValue } from "./rules";

/**
 * What the organisation admin panel shows, and the organisation's mail and
 * storage settings. Never any dossier content: only counts per MJPM.
 */

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRoleValue | null;
  isOrgAdmin: boolean;
  archived: boolean;
  dossierCount: number;
};

export type OrgOverview = {
  id: string;
  name: string;
  sharedFolderHint: string | null;
  members: MemberRow[];
  assignments: { assistantId: string; mandataireId: string }[];
  smtp: {
    id: string;
    provider: SmtpProvider;
    smtpHost: string;
    smtpPort: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
  } | null;
  destinations: { moduleType: ModuleType; destinationEmail: string; imapFolder: string | null }[];
};

export async function getOrgOverview(orgId: string): Promise<OrgOverview | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      sharedFolderHint: true,
      members: { select: { id: true, name: true, email: true, orgRole: true, isOrgAdmin: true, archivedAt: true } },
      smtpConfig: {
        select: { id: true, provider: true, smtpHost: true, smtpPort: true, secure: true, username: true, fromName: true, fromEmail: true },
      },
      moduleConfigs: { select: { moduleType: true, destinationEmail: true, imapFolder: true } },
    },
  });
  if (!org) return null;

  const memberIds = org.members.map((m) => m.id);
  const [counts, assignments] = await Promise.all([
    db.dossier.groupBy({ by: ["userId"], where: { userId: { in: memberIds } }, _count: { _all: true } }),
    db.assistantAssignment.findMany({
      where: { assistantId: { in: memberIds } },
      select: { assistantId: true, mandataireId: true },
    }),
  ]);
  const countOf = new Map(counts.map((c) => [c.userId, c._count._all]));

  const members = org.members
    .map((m) => ({
      id: m.id,
      name: m.name || m.email,
      email: m.email,
      orgRole: m.orgRole,
      isOrgAdmin: m.isOrgAdmin,
      archived: m.archivedAt !== null,
      dossierCount: countOf.get(m.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return {
    id: org.id,
    name: org.name,
    sharedFolderHint: org.sharedFolderHint,
    members,
    assignments,
    smtp: org.smtpConfig,
    destinations: org.moduleConfigs,
  };
}

export async function saveOrgSmtp(orgId: string, data: SmtpConfigFormData): Promise<void> {
  const validated = smtpConfigSchema.parse(data);
  const provider: SmtpProvider =
    validated.provider === "GMAIL" || validated.provider === "OUTLOOK" ? validated.provider : "OTHER";
  const fields = {
    provider,
    smtpHost: validated.smtpHost,
    smtpPort: validated.smtpPort,
    secure: validated.secure,
    username: validated.username,
    encryptedPassword: encrypt(validated.password),
    fromName: validated.fromName,
    fromEmail: validated.fromEmail,
  };
  await db.orgSmtpConfig.upsert({ where: { orgId }, create: { orgId, ...fields }, update: fields });
}

/** Back to each member's own mailbox. */
export async function removeOrgSmtp(orgId: string): Promise<void> {
  await db.orgSmtpConfig.deleteMany({ where: { orgId } });
}

export const destinationSchema = z.object({
  moduleType: z.enum(["APA", "ASH", "PCH"]),
  destinationEmail: z.string().trim().email("Email invalide").or(z.literal("")),
  imapFolder: z.string().trim().max(200).optional(),
});

/** Organisation-wide destination of a module; empty email = remove it. */
export async function saveOrgDestination(orgId: string, input: z.infer<typeof destinationSchema>): Promise<void> {
  const data = destinationSchema.parse(input);
  if (!data.destinationEmail) {
    await db.orgModuleConfig.deleteMany({ where: { orgId, moduleType: data.moduleType } });
    return;
  }
  const fields = { destinationEmail: data.destinationEmail, imapFolder: data.imapFolder || null };
  await db.orgModuleConfig.upsert({
    where: { orgId_moduleType: { orgId, moduleType: data.moduleType } },
    create: { orgId, moduleType: data.moduleType, ...fields },
    update: fields,
  });
}

export async function saveSharedFolderHint(orgId: string, hint: string): Promise<void> {
  const value = hint.trim().slice(0, 300);
  await db.organization.update({ where: { id: orgId }, data: { sharedFolderHint: value || null } });
}
