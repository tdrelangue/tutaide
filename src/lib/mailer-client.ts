import nodemailer from "nodemailer";

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
  attachmentUrls?: string[];
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
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

    // Build attachments by fetching blob URLs
    const attachments: { filename: string; content: Buffer }[] = [];
    for (const url of payload.attachmentUrls ?? []) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      // Extract filename from URL path, removing random suffix from Vercel Blob
      const urlPath = new URL(url).pathname;
      const filename = decodeURIComponent(urlPath.split("/").pop() || "document");
      attachments.push({ filename, content: buffer });
    }

    const info = await transporter.sendMail({
      from: `"${payload.smtp.fromName}" <${payload.smtp.fromEmail}>`,
      to: payload.recipients.join(", "),
      cc: payload.ccRecipients?.length ? payload.ccRecipients.join(", ") : undefined,
      bcc: payload.bccRecipients?.length ? payload.bccRecipients.join(", ") : undefined,
      subject: payload.subject,
      text: payload.body,
      attachments,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
