import { ImapFlow } from "imapflow";
import { db } from "./db";
import { decrypt } from "./encryption";
import { imapHostFor } from "./imap-host";

/**
 * Fills the APA/ASH/PCH "Dossier IMAP" with the right path for the user's
 * mailbox, instead of a fixed "INBOX/APA" that is wrong on servers using "."
 * as separator or an "INBOX." prefix (OVH, Dovecot…). Only fills folders left
 * empty: a folder typed by the user is never overwritten. Folder names only,
 * no email is read.
 */

const DETECT_TIMEOUT_MS = 8000;

export type FolderLayout = { prefix: string; delimiter: string };

/** "INBOX.APA" when the server has a personal prefix, else "INBOX<delimiter>APA". */
export function moduleFolderFor(layout: FolderLayout, moduleType: string): string {
  if (layout.prefix) return `${layout.prefix}${moduleType}`;
  return `INBOX${layout.delimiter || "/"}${moduleType}`;
}

async function readLayout(host: string, user: string, pass: string): Promise<FolderLayout> {
  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: DETECT_TIMEOUT_MS,
    greetingTimeout: DETECT_TIMEOUT_MS,
  });
  await client.connect();
  try {
    // ImapFlow sets `namespace` (personal namespace) after connect, but its typings omit it.
    const ns = (client as unknown as { namespace?: { prefix?: string; delimiter?: string } }).namespace;
    let delimiter = ns?.delimiter ?? "";
    if (!delimiter) delimiter = (await client.list())[0]?.delimiter ?? "/";
    return { prefix: ns?.prefix ?? "", delimiter };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** The user's mailbox layout, from the SMTP credentials they saved; null if unavailable. */
export async function detectFolderLayout(userId: string): Promise<FolderLayout | null> {
  const smtp = await db.smtpConfig.findUnique({
    where: { userId },
    select: { smtpHost: true, username: true, encryptedPassword: true, fromEmail: true },
  });
  if (!smtp) return null;
  try {
    const host = imapHostFor(smtp.smtpHost, smtp.fromEmail || smtp.username);
    return await readLayout(host, smtp.username, decrypt(smtp.encryptedPassword));
  } catch {
    return null; // wrong password, no IMAP, offline: keep the default behaviour
  }
}

/** Sets the detected folder on every module config whose IMAP folder is empty. Never throws. */
export async function fillMissingModuleFolders(userId: string): Promise<number> {
  try {
    const empty = await db.moduleConfig.findMany({
      where: { userId, OR: [{ imapFolder: null }, { imapFolder: "" }] },
      select: { id: true, moduleType: true },
    });
    if (empty.length === 0) return 0;
    const layout = await detectFolderLayout(userId);
    if (!layout) return 0;
    await Promise.all(
      empty.map((c) =>
        db.moduleConfig.update({ where: { id: c.id }, data: { imapFolder: moduleFolderFor(layout, c.moduleType) } })
      )
    );
    return empty.length;
  } catch {
    return 0;
  }
}
