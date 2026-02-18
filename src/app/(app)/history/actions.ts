"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword } from "../settings/actions";
import { sendEmailSchema, type SendEmailFormData } from "@/lib/validations";
import type { EmailSendStatus } from "@prisma/client";

async function getUserSignature(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { signature: true },
  });
  return user?.signature ?? "";
}

export type EmailEvent = {
  id: string;
  status: EmailSendStatus;
  errorMessage: string | null;
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

export type EmailBatchGroup = {
  batchId: string | null;
  createdAt: Date;
  events: EmailEvent[];
};

// Get email history grouped by batch
export async function getEmailHistory(): Promise<EmailBatchGroup[]> {
  const userId = await requireAuth();

  const events = await db.emailSendEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      dossier: {
        select: { fullName: true },
      },
    },
  });

  // Group by batch
  const batchMap = new Map<string | null, EmailEvent[]>();

  for (const event of events) {
    const batchId = event.batchId;
    const mapped: EmailEvent = {
      id: event.id,
      status: event.status,
      errorMessage: event.errorMessage,
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
    };

    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, []);
    }
    batchMap.get(batchId)!.push(mapped);
  }

  // Convert to array and sort by first event's createdAt
  const groups: EmailBatchGroup[] = Array.from(batchMap.entries()).map(
    ([batchId, events]) => ({
      batchId,
      createdAt: events[0].createdAt,
      events,
    })
  );

  return groups;
}

// Get emails for a specific dossier
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
    status: event.status,
    errorMessage: event.errorMessage,
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

// Send email
export async function sendEmailAction(
  data: SendEmailFormData
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = sendEmailSchema.parse(data);
    const signature = await getUserSignature(userId);

    // Get SMTP config
    const smtpConfig = await getSmtpConfigWithPassword();
    if (!smtpConfig) {
      return { success: false, error: "Configuration SMTP non définie" };
    }

    // Create batch for grouping
    const batch = await db.emailBatch.create({
      data: {
        userId,
        description: `Email à ${validated.recipients.join(", ")}`,
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

    // Get attachment URLs if any
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

    // Create send event (pending)
    const event = await db.emailSendEvent.create({
      data: {
        userId,
        dossierId: validated.dossierId || null,
        batchId: batch.id,
        status: "PENDING",
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

    // Call mailer service
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
      dossierName,
    });

    // Update event status
    await db.emailSendEvent.update({
      where: { id: event.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error || null,
        sentAt: result.success ? new Date() : null,
      },
    });

    revalidatePath("/history");
    revalidatePath("/dossiers");

    if (result.success) {
      return { success: true, eventId: event.id };
    } else {
      return { success: false, error: result.error || "Échec de l'envoi" };
    }
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: "Erreur lors de l'envoi" };
  }
}

// Resend email
export async function resendEmail(
  eventId: string
): Promise<{ success: boolean; newEventId?: string; error?: string }> {
  const userId = await requireAuth();

  // Get original event
  const originalEvent = await db.emailSendEvent.findFirst({
    where: { id: eventId, userId },
    include: {
      attachments: {
        include: { document: true },
      },
    },
  });

  if (!originalEvent) {
    return { success: false, error: "Événement non trouvé" };
  }

  // Create new send with same data
  return sendEmailAction({
    dossierId: originalEvent.dossierId || undefined,
    emailType: "STANDARD",
    recipients: originalEvent.recipients,
    ccRecipients: originalEvent.ccRecipients,
    bccRecipients: originalEvent.bccRecipients,
    subject: originalEvent.subject,
    body: originalEvent.body,
    attachmentIds: originalEvent.attachments.map((a) => a.documentId),
  });
}
