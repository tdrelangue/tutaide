import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer";

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface SendEmailPayload {
  smtp: SmtpSettings;
  recipients: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  subject: string;
  body: string;
  attachmentPaths?: string[];
  signature?: string;
  moduleType?: "APA" | "ASH";
  dossierName?: string;
  imapFolder?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Resolve template placeholders. */
function resolvePlaceholders(
  text: string,
  vars: { signature?: string; dossierName?: string }
): string {
  const now = new Date();
  const mois = now.toLocaleDateString("fr-FR", { month: "long" });
  const annee = now.getFullYear().toString();
  const tri = Math.ceil((now.getMonth() + 1) / 3).toString();
  const suffix = tri === "1" ? "er" : "eme";

  return text
    .replace(/\{\{signature\}\}/g, vars.signature ?? "")
    .replace(/\{\{nom_protege\}\}/g, vars.dossierName ?? "")
    .replace(/\{\{mois\}\}/g, mois)
    .replace(/\{\{annee\}\}/g, annee)
    .replace(/\{\{trimestre\}\}/g, tri)
    .replace(/\{\{suffix\}\}/g, suffix);
}

/** Guess IMAP host from email domain. */
function guessImapHost(email: string): string {
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  if (domain.includes("orange")) return "imap.orange.fr";
  if (domain.includes("gmail")) return "imap.gmail.com";
  if (["outlook", "hotmail", "live", "office365"].some((k) => domain.includes(k)))
    return "outlook.office365.com";
  if (domain.includes("yahoo")) return "imap.mail.yahoo.com";
  return `imap.${domain}`;
}

/** Save raw email to an IMAP folder. */
async function saveToImap(
  imapHost: string,
  username: string,
  password: string,
  folder: string,
  rawMessage: Buffer
): Promise<string | null> {
  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: { user: username, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    try {
      await client.mailboxCreate(folder);
    } catch {
      // folder already exists
    }
    await client.append(folder, rawMessage, ["\\Seen"]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "IMAP error";
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function sendEmail(
  payload: SendEmailPayload
): Promise<SendEmailResponse> {
  try {
    const transporter = nodemailer.createTransport({
      host: payload.smtp.host,
      port: payload.smtp.port,
      secure: payload.smtp.port === 465,
      auth: {
        user: payload.smtp.username,
        pass: payload.smtp.password,
      },
      tls: { rejectUnauthorized: false },
    });

    // Build attachments from local file paths
    const attachments: { filename: string; content: Buffer }[] = [];
    for (const filePath of payload.attachmentPaths ?? []) {
      try {
        const buffer = await fs.readFile(filePath);
        const filename = path.basename(filePath).replace(/^\d+-/, "");
        attachments.push({ filename, content: buffer });
      } catch {
        console.error("Failed to read attachment:", filePath);
      }
    }

    // Resolve all placeholders
    const vars = {
      signature: payload.signature,
      dossierName: payload.dossierName,
    };
    const subject = resolvePlaceholders(payload.subject, vars);
    const body = resolvePlaceholders(payload.body, vars);

    const mailOptions = {
      from: `"${payload.smtp.fromName}" <${payload.smtp.fromEmail}>`,
      to: payload.recipients.join(", "),
      cc: payload.ccRecipients?.length
        ? payload.ccRecipients.join(", ")
        : undefined,
      bcc: payload.bccRecipients?.length
        ? payload.bccRecipients.join(", ")
        : undefined,
      subject,
      text: body,
      attachments,
    };

    // Send via SMTP
    const info = await transporter.sendMail(mailOptions);

    // Save to IMAP folders (non-blocking)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const composer = new MailComposer(mailOptions as any);
      const rawBuffer: Buffer = await new Promise((resolve, reject) => {
        composer.compile().build((err: Error | null, buf: Buffer) => {
          if (err) reject(err);
          else resolve(buf);
        });
      });

      const imapHost = guessImapHost(payload.smtp.fromEmail);

      // Save to module folder (configurable, defaults to INBOX/APA or INBOX/ASH)
      if (payload.moduleType) {
        const moduleFolder = payload.imapFolder || `INBOX/${payload.moduleType}`;
        const err = await saveToImap(
          imapHost,
          payload.smtp.username,
          payload.smtp.password,
          moduleFolder,
          rawBuffer
        );
        if (err) console.error(`[IMAP] ${moduleFolder}:`, err);
      }

      // Save to Sent folder
      const sentErr = await saveToImap(
        imapHost,
        payload.smtp.username,
        payload.smtp.password,
        "INBOX/OUTBOX",
        rawBuffer
      );
      if (sentErr) console.error("[IMAP] OUTBOX:", sentErr);
    } catch (imapError) {
      console.error("[IMAP] Error:", imapError);
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
