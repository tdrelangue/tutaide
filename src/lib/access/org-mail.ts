import type { ModuleType } from "@prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

/**
 * The organisation's shared mailbox and module destinations. Members of an
 * organisation send through them when the organisation admin has set them;
 * otherwise (or for solo accounts) their own settings apply, as before.
 */

export type SmtpWithPassword = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export type OrgModuleDestination = {
  id: string;
  moduleType: ModuleType;
  destinationEmail: string;
  imapFolder: string | null;
};

async function activeOrgIdOf(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true, organization: { select: { archivedAt: true } } },
  });
  return user?.orgId && user.organization?.archivedAt == null ? user.orgId : null;
}

export async function getOrgSmtpFor(userId: string): Promise<SmtpWithPassword | null> {
  const orgId = await activeOrgIdOf(userId);
  if (!orgId) return null;
  const config = await db.orgSmtpConfig.findUnique({ where: { orgId } });
  if (!config) return null;
  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.secure,
    username: config.username,
    password: decrypt(config.encryptedPassword),
    fromName: config.fromName,
    fromEmail: config.fromEmail,
  };
}

export async function getOrgModuleDestinationsFor(userId: string): Promise<OrgModuleDestination[]> {
  const orgId = await activeOrgIdOf(userId);
  if (!orgId) return [];
  return db.orgModuleConfig.findMany({
    where: { orgId },
    select: { id: true, moduleType: true, destinationEmail: true, imapFolder: true },
  });
}

/** Signature used for a dossier's emails: its MJPM's (the responsible person). */
export async function getSignatureOf(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { signature: true } });
  return user?.signature ?? "";
}
