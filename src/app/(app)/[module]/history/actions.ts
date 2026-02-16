"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword } from "../../settings/actions";
import {
  sendEmailSchema,
  bulkSendSchema,
  type SendEmailFormData,
  type BulkSendFormData,
} from "@/lib/validations";
import type { EmailSendStatus, EmailType, EmailReason } from "@prisma/client";

export type EmailEvent = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  errorMessage: string | null;
  moduleType: "APA" | "ASH" | null;
  emailType: "STANDARD" | "DERNIER";
  emailReason: "DECES" | "DESSAISISSEMENT" | null;
  recipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
  subject: string;
  body: string;
  createdAt: Date;
  sentAt: Date | null;
  dossierId: string | null;
  dossierName: string | null;
  batchId: string | null;
};

export type BulkSendResult = {
  dossierId: string;
  success: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Fetch email history for a specific dossier
// ---------------------------------------------------------------------------
export async function getDossierEmails(dossierId: string): Promise<EmailEvent[]> {
  const userId = await requireAuth();

  const events = await db.emailSendEvent.findMany({
    where: { userId, dossierId },
    orderBy: { createdAt: "desc" },
    include: {
      dossier: {
        select: { fullName: true },
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    status: event.status as EmailEvent["status"],
    errorMessage: event.errorMessage,
    moduleType: (event.moduleType as EmailEvent["moduleType"]) ?? null,
    emailType: (event.emailType as EmailEvent["emailType"]) ?? "STANDARD",
    emailReason: (event.emailReason as EmailEvent["emailReason"]) ?? null,
    recipients: event.recipients,
    ccRecipients: event.ccRecipients,
    bccRecipients: event.bccRecipients,
    subject: event.subject,
    body: event.body,
    createdAt: event.createdAt,
    sentAt: event.sentAt,
    dossierId: event.dossierId,
    dossierName: event.dossier?.fullName || null,
    batchId: event.batchId,
  }));
}

// ---------------------------------------------------------------------------
// Fetch email history filtered by module type
// ---------------------------------------------------------------------------
export async function getModuleEmailHistory(
  moduleType: "APA" | "ASH"
): Promise<EmailEvent[]> {
  const userId = await requireAuth();

  const events = await db.emailSendEvent.findMany({
    where: { userId, moduleType },
    orderBy: { createdAt: "desc" },
    include: {
      dossier: {
        select: { fullName: true },
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    status: event.status as EmailEvent["status"],
    errorMessage: event.errorMessage,
    moduleType: (event.moduleType as EmailEvent["moduleType"]) ?? null,
    emailType: (event.emailType as EmailEvent["emailType"]) ?? "STANDARD",
    emailReason: (event.emailReason as EmailEvent["emailReason"]) ?? null,
    recipients: event.recipients,
    ccRecipients: event.ccRecipients,
    bccRecipients: event.bccRecipients,
    subject: event.subject,
    body: event.body,
    createdAt: event.createdAt,
    sentAt: event.sentAt,
    dossierId: event.dossierId,
    dossierName: event.dossier?.fullName || null,
    batchId: event.batchId,
  }));
}

// ---------------------------------------------------------------------------
// Send a single email (module-aware)
// ---------------------------------------------------------------------------
export async function sendEmailAction(
  data: SendEmailFormData
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = sendEmailSchema.parse(data);

    const smtpConfig = await getSmtpConfigWithPassword();
    if (!smtpConfig) {
      return { success: false, error: "Configuration SMTP non definie" };
    }

    const batch = await db.emailBatch.create({
      data: {
        userId,
        moduleType: validated.moduleType ?? null,
        description: `Email a ${validated.recipients.join(", ")}`,
      },
    });

    // Resolve attachment URLs if provided
    let attachmentUrls: string[] = [];
    if (validated.attachmentIds.length > 0) {
      const documents = await db.document.findMany({
        where: {
          id: { in: validated.attachmentIds },
          userId,
        },
      });
      attachmentUrls = documents.map((d) => d.blobUrl);
    }

    const event = await db.emailSendEvent.create({
      data: {
        userId,
        dossierId: validated.dossierId || null,
        batchId: batch.id,
        status: "PENDING",
        moduleType: validated.moduleType ?? null,
        emailType: validated.emailType ?? "STANDARD",
        emailReason: validated.emailReason ?? null,
        recipients: validated.recipients,
        ccRecipients: validated.ccRecipients,
        bccRecipients: validated.bccRecipients,
        subject: validated.subject,
        body: validated.body,
        attachments: {
          create: validated.attachmentIds.map((docId) => ({
            documentId: docId,
          })),
        },
      },
    });

    const result = await sendEmail({
      smtp: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        username: smtpConfig.username,
        password: smtpConfig.password,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.fromEmail,
      },
      recipients: validated.recipients,
      ccRecipients: validated.ccRecipients,
      bccRecipients: validated.bccRecipients,
      subject: validated.subject,
      body: validated.body,
      attachmentUrls,
    });

    await db.emailSendEvent.update({
      where: { id: event.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error || null,
        sentAt: result.success ? new Date() : null,
      },
    });

    revalidatePath("/history");
    revalidatePath("/apa/history");
    revalidatePath("/ash/history");
    revalidatePath("/dossiers");

    if (result.success) {
      return { success: true, eventId: event.id };
    }
    return { success: false, error: result.error || "Echec de l'envoi" };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: "Erreur lors de l'envoi" };
  }
}

// ---------------------------------------------------------------------------
// Bulk send emails to multiple dossiers at once
// ---------------------------------------------------------------------------
export async function bulkSendAction(
  data: BulkSendFormData
): Promise<BulkSendResult[]> {
  const userId = await requireAuth();
  const validated = bulkSendSchema.parse(data);

  const smtpConfig = await getSmtpConfigWithPassword();
  if (!smtpConfig) {
    return validated.dossierIds.map((dossierId) => ({
      dossierId,
      success: false,
      error: "Configuration SMTP non definie",
    }));
  }

  // Create a single batch for the entire bulk send
  const batch = await db.emailBatch.create({
    data: {
      userId,
      moduleType: validated.moduleType,
      description: `Envoi groupe ${validated.moduleType} - ${validated.dossierIds.length} dossiers`,
    },
  });

  const results: BulkSendResult[] = [];

  for (const dossierId of validated.dossierIds) {
    try {
      // Fetch the dossier and its primary email
      const dossier = await db.dossier.findFirst({
        where: { id: dossierId, userId },
        select: {
          id: true,
          fullName: true,
          primaryEmail: true,
          ccEmails: true,
          bccEmails: true,
        },
      });

      if (!dossier) {
        results.push({
          dossierId,
          success: false,
          error: "Dossier non trouve",
        });
        continue;
      }

      if (!dossier.primaryEmail) {
        results.push({
          dossierId,
          success: false,
          error: `Pas d'email principal pour ${dossier.fullName}`,
        });
        continue;
      }

      // Create send event (pending)
      const event = await db.emailSendEvent.create({
        data: {
          userId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: validated.moduleType,
          emailType: "STANDARD",
          recipients: [dossier.primaryEmail],
          ccRecipients: dossier.ccEmails,
          bccRecipients: dossier.bccEmails,
          subject: validated.subject,
          body: validated.body,
        },
      });

      // Attempt to send
      const sendResult = await sendEmail({
        smtp: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          username: smtpConfig.username,
          password: smtpConfig.password,
          fromName: smtpConfig.fromName,
          fromEmail: smtpConfig.fromEmail,
        },
        recipients: [dossier.primaryEmail],
        ccRecipients: dossier.ccEmails,
        bccRecipients: dossier.bccEmails,
        subject: validated.subject,
        body: validated.body,
      });

      // Update event with the result
      await db.emailSendEvent.update({
        where: { id: event.id },
        data: {
          status: sendResult.success ? "SENT" : "FAILED",
          errorMessage: sendResult.error || null,
          sentAt: sendResult.success ? new Date() : null,
        },
      });

      results.push({
        dossierId,
        success: sendResult.success,
        error: sendResult.error,
      });
    } catch (error) {
      console.error(`Error sending to dossier ${dossierId}:`, error);
      results.push({
        dossierId,
        success: false,
        error: "Erreur inattendue lors de l'envoi",
      });
    }
  }

  revalidatePath("/history");
  revalidatePath("/apa/history");
  revalidatePath("/ash/history");
  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");

  return results;
}

// ---------------------------------------------------------------------------
// Resend a previously sent/failed email
// ---------------------------------------------------------------------------
export async function resendEmail(
  eventId: string
): Promise<{ success: boolean; newEventId?: string; error?: string }> {
  const userId = await requireAuth();

  const originalEvent = await db.emailSendEvent.findFirst({
    where: { id: eventId, userId },
    include: {
      attachments: {
        include: { document: true },
      },
    },
  });

  if (!originalEvent) {
    return { success: false, error: "Evenement non trouve" };
  }

  return sendEmailAction({
    dossierId: originalEvent.dossierId || undefined,
    moduleType:
      (originalEvent.moduleType as "APA" | "ASH" | undefined) ?? undefined,
    emailType:
      (originalEvent.emailType as "STANDARD" | "DERNIER") ?? "STANDARD",
    emailReason:
      (originalEvent.emailReason as
        | "DECES"
        | "DESSAISISSEMENT"
        | undefined) ?? undefined,
    recipients: originalEvent.recipients,
    ccRecipients: originalEvent.ccRecipients,
    bccRecipients: originalEvent.bccRecipients,
    subject: originalEvent.subject,
    body: originalEvent.body,
    attachmentIds: originalEvent.attachments.map((a) => a.documentId),
  });
}
