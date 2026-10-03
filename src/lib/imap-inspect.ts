import { ImapFlow } from "imapflow";
import { db } from "./db";
import { decrypt } from "./encryption";
import { imapHostFor } from "./imap-host";

/**
 * Admin support tool: lists the folder tree of a user's mailbox with the
 * credentials they saved in Paramètres › SMTP. Reads folder NAMES only, never
 * a message, and never returns the password.
 */

const CONNECT_TIMEOUT_MS = 15000;
const MODULES = ["APA", "ASH", "PCH"] as const;

export type ImapFolder = {
  path: string;
  name: string;
  depth: number;
  /** IMAP special-use flag, e.g. "\\Sent", "\\Inbox", "\\Trash". */
  specialUse: string | null;
};

export type ImapInspection =
  | {
      ok: true;
      host: string;
      username: string;
      delimiter: string;
      /** Personal namespace prefix, e.g. "INBOX." on some servers, "" on most. */
      prefix: string;
      folders: ImapFolder[];
      modules: { module: string; folder: string; exists: boolean }[];
    }
  | { ok: false; host: string | null; error: string };

function humanizeImapError(error: unknown): string {
  const e = error as { code?: string; authenticationFailed?: boolean; responseText?: string; message?: string }; // ImapFlow error shape
  if (e?.authenticationFailed) return "Identifiants refusés par le serveur IMAP (mot de passe changé, ou mot de passe d'application requis).";
  if (e?.code === "ENOTFOUND") return "Serveur IMAP introuvable : essayez un autre serveur ci-dessus.";
  if (e?.code === "ECONNREFUSED") return "Connexion refusée par le serveur IMAP (port 993).";
  if (e?.code === "ETIMEDOUT" || e?.code === "ECONNRESET") return "Délai dépassé : serveur injoignable.";
  return `Erreur IMAP : ${e?.responseText ?? e?.message ?? "inconnue"}`;
}

async function listFolders(host: string, user: string, pass: string) {
  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
  });
  await client.connect();
  try {
    const list = await client.list();
    // ImapFlow sets `namespace` (personal namespace) after connect, but its typings omit it.
    const ns = (client as unknown as { namespace?: { prefix?: string; delimiter?: string } }).namespace;
    return { list, prefix: ns?.prefix ?? "", nsDelimiter: ns?.delimiter ?? "" };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function inspectUserImap(userId: string, hostOverride?: string): Promise<ImapInspection> {
  const smtp = await db.smtpConfig.findUnique({
    where: { userId },
    select: { smtpHost: true, username: true, encryptedPassword: true, fromEmail: true },
  });
  if (!smtp) return { ok: false, host: null, error: "Cet utilisateur n'a pas encore configuré son SMTP (Paramètres › SMTP)." };

  const host = hostOverride?.trim() || imapHostFor(smtp.smtpHost, smtp.fromEmail || smtp.username);
  if (!/^[a-z0-9.-]+$/i.test(host)) return { ok: false, host, error: "Nom de serveur invalide." };

  try {
    const { list, prefix, nsDelimiter } = await listFolders(host, smtp.username, decrypt(smtp.encryptedPassword));
    const delimiter = list[0]?.delimiter || nsDelimiter || "/";
    const folders = list
      .map((f) => ({
        path: f.path,
        name: f.name,
        depth: f.path.split(f.delimiter || delimiter).length - 1,
        specialUse: f.specialUse ?? (f.path.toUpperCase() === "INBOX" ? "\\Inbox" : null),
      }))
      .sort((a, b) => a.path.localeCompare(b.path, "fr"));

    const configs = await db.moduleConfig.findMany({ where: { userId }, select: { moduleType: true, imapFolder: true } });
    const paths = new Set(folders.map((f) => f.path.toLowerCase()));
    const modules = MODULES.filter((m) => configs.some((c) => c.moduleType === m)).map((m) => {
      const folder = configs.find((c) => c.moduleType === m)?.imapFolder || `INBOX/${m}`;
      return { module: m, folder, exists: paths.has(folder.toLowerCase()) };
    });

    return { ok: true, host, username: smtp.username, delimiter, prefix, folders, modules };
  } catch (error) {
    return { ok: false, host, error: humanizeImapError(error) };
  }
}
