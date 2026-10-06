import type { ModuleType } from "@prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getOrgModuleDestinationsFor, getOrgSmtpFor, type SmtpWithPassword } from "@/lib/access/org-mail";

/**
 * Mail settings used when SENDING, with the decrypted password. Internal to
 * the server: this module is not a "use server" file, so the browser can
 * never call it (only server actions that send email do).
 * Organisation members use the organisation's mailbox/destinations when set.
 */

export async function getSendingSmtp(userId: string): Promise<SmtpWithPassword | null> {
  const orgSmtp = await getOrgSmtpFor(userId);
  if (orgSmtp) return orgSmtp;

  const config = await db.smtpConfig.findUnique({ where: { userId } });
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

export type SendingModuleConfig = { destinationEmail: string; imapFolder: string | null } | null;

export async function getSendingModuleConfig(userId: string, moduleType: ModuleType): Promise<SendingModuleConfig> {
  const orgConfig = (await getOrgModuleDestinationsFor(userId)).find((c) => c.moduleType === moduleType);
  if (orgConfig) return orgConfig;
  return db.moduleConfig.findUnique({
    where: { userId_moduleType: { userId, moduleType } },
    select: { destinationEmail: true, imapFolder: true },
  });
}
