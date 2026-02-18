"use server";

import fs from "fs/promises";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword, getModuleConfig } from "../../settings/actions";
import {
  sendEmailSchema,
  bulkSendSchema,
  sendAllSchema,
  type SendEmailFormData,
  type BulkSendFormData,
} from "@/lib/validations";
import type { EmailSendStatus, EmailType, EmailReason, ModuleType } from "@prisma/client";

async function getUserSignature(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { signature: true },
  });
  return user?.signature ?? "";
}

/** Delete all documents from a dossier (DB records + files on disk). */
async function clearDossierDocuments(dossierId: string, userId: string): Promise<void> {
  const documents = await db.document.findMany({
    where: { dossierId, userId },
    select: { id: true, blobUrl: true },
  });

  // Delete files from disk
  for (const doc of documents) {
    try {
      await fs.unlink(doc.blobUrl);
    } catch {
      // File may already be gone
    }
  }

  // Delete DB records (cascades to EmailSendEventAttachment)
  await db.document.deleteMany({
    where: { dossierId, userId },
  });
}

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
    const signature = await getUserSignature(userId);

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

    // Fetch dossier name for placeholder resolution
    let dossierName: string | undefined;
    if (validated.dossierId) {
      const dossier = await db.dossier.findFirst({
        where: { id: validated.dossierId, userId },
        select: { fullName: true },
      });
      dossierName = dossier?.fullName ?? undefined;
    }

    // Fetch module config for IMAP folder
    let imapFolder: string | undefined;
    if (validated.moduleType) {
      const moduleConfig = await getModuleConfig(validated.moduleType as ModuleType);
      imapFolder = moduleConfig?.imapFolder ?? undefined;
    }

    // Resolve attachment URLs if provided
    let attachmentPaths: string[] = [];
    if (validated.attachmentIds.length > 0) {
      const documents = await db.document.findMany({
        where: {
          id: { in: validated.attachmentIds },
          userId,
        },
      });
      attachmentPaths = documents.map((d) => d.blobUrl);
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
      attachmentPaths,
      signature,
      moduleType: validated.moduleType as "APA" | "ASH" | undefined,
      dossierName,
      imapFolder,
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
  const signature = await getUserSignature(userId);

  const smtpConfig = await getSmtpConfigWithPassword();
  if (!smtpConfig) {
    return validated.dossierIds.map((dossierId) => ({
      dossierId,
      success: false,
      error: "Configuration SMTP non definie",
    }));
  }

  // Get the module destination email (government organism)
  const moduleConfig = await getModuleConfig(validated.moduleType as ModuleType);
  if (!moduleConfig?.destinationEmail) {
    return validated.dossierIds.map((dossierId) => ({
      dossierId,
      success: false,
      error: "Email de destination non configure dans les parametres",
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
      const dossier = await db.dossier.findFirst({
        where: { id: dossierId, userId },
        select: {
          id: true,
          fullName: true,
          primaryEmail: true,
          ccEmails: true,
          bccEmails: true,
          documents: { select: { blobUrl: true } },
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

      // TO = government, CC = protege (if set) + dossier CC list
      const recipients = [moduleConfig.destinationEmail];
      const ccRecipients = [
        ...(dossier.primaryEmail ? [dossier.primaryEmail] : []),
        ...dossier.ccEmails,
      ];

      const event = await db.emailSendEvent.create({
        data: {
          userId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: validated.moduleType,
          emailType: "STANDARD",
          recipients,
          ccRecipients,
          bccRecipients: dossier.bccEmails,
          subject: validated.subject,
          body: validated.body,
        },
      });

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
        recipients,
        ccRecipients,
        bccRecipients: dossier.bccEmails,
        subject: validated.subject,
        body: validated.body,
        attachmentPaths: dossier.documents.map((d) => d.blobUrl),
        signature,
        moduleType: validated.moduleType as "APA" | "ASH",
        dossierName: dossier.fullName,
        imapFolder: moduleConfig.imapFolder ?? undefined,
      });

      await db.emailSendEvent.update({
        where: { id: event.id },
        data: {
          status: sendResult.success ? "SENT" : "FAILED",
          errorMessage: sendResult.error || null,
          sentAt: sendResult.success ? new Date() : null,
        },
      });

      // Clear documents from dossier after successful send
      if (sendResult.success) {
        await clearDossierDocuments(dossierId, userId);
      }

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

// ---------------------------------------------------------------------------
// Send emails for ALL non-empty active dossiers in a module
// ---------------------------------------------------------------------------
export async function sendAllAction(
  data: { moduleType: "APA" | "ASH"; subject: string; body: string }
): Promise<BulkSendResult[]> {
  const userId = await requireAuth();
  const validated = sendAllSchema.parse(data);
  const signature = await getUserSignature(userId);

  const smtpConfig = await getSmtpConfigWithPassword();
  if (!smtpConfig) {
    return [{ dossierId: "", success: false, error: "Configuration SMTP non definie" }];
  }

  const moduleConfig = await getModuleConfig(validated.moduleType as ModuleType);
  if (!moduleConfig?.destinationEmail) {
    return [{ dossierId: "", success: false, error: "Email de destination non configure dans les parametres" }];
  }

  // Fetch all active dossiers with at least one document
  const dossiers = await db.dossier.findMany({
    where: {
      userId,
      moduleType: validated.moduleType,
      status: "ACTIVE",
      documents: { some: {} },
    },
    select: {
      id: true,
      fullName: true,
      primaryEmail: true,
      ccEmails: true,
      bccEmails: true,
      documents: { select: { id: true, blobUrl: true } },
    },
  });

  if (dossiers.length === 0) {
    return [{ dossierId: "", success: false, error: "Aucun dossier actif avec des documents" }];
  }

  const batch = await db.emailBatch.create({
    data: {
      userId,
      moduleType: validated.moduleType,
      description: `Envoi total ${validated.moduleType} - ${dossiers.length} dossiers`,
    },
  });

  const results: BulkSendResult[] = [];

  for (const dossier of dossiers) {
    try {
      const recipients = [moduleConfig.destinationEmail];
      const ccRecipients = [
        ...(dossier.primaryEmail ? [dossier.primaryEmail] : []),
        ...dossier.ccEmails,
      ];

      const event = await db.emailSendEvent.create({
        data: {
          userId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: validated.moduleType,
          emailType: "STANDARD",
          recipients,
          ccRecipients,
          bccRecipients: dossier.bccEmails,
          subject: validated.subject,
          body: validated.body,
          attachments: {
            create: dossier.documents.map((doc) => ({
              documentId: doc.id,
            })),
          },
        },
      });

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
        recipients,
        ccRecipients,
        bccRecipients: dossier.bccEmails,
        subject: validated.subject,
        body: validated.body,
        attachmentPaths: dossier.documents.map((d) => d.blobUrl),
        signature,
        moduleType: validated.moduleType as "APA" | "ASH",
        dossierName: dossier.fullName,
        imapFolder: moduleConfig.imapFolder ?? undefined,
      });

      await db.emailSendEvent.update({
        where: { id: event.id },
        data: {
          status: sendResult.success ? "SENT" : "FAILED",
          errorMessage: sendResult.error || null,
          sentAt: sendResult.success ? new Date() : null,
        },
      });

      // Clear documents from dossier after successful send
      if (sendResult.success) {
        await clearDossierDocuments(dossier.id, userId);
      }

      results.push({
        dossierId: dossier.id,
        success: sendResult.success,
        error: sendResult.error,
      });
    } catch (error) {
      console.error(`Error sending for dossier ${dossier.id}:`, error);
      results.push({
        dossierId: dossier.id,
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
