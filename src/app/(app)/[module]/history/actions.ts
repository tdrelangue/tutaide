"use server";

import { revalidatePath } from "next/cache";
import { attachmentPathsFor, removeDocumentFile } from "@/lib/storage/document-files";
import { db } from "@/lib/db";
import { requireOwnerScope } from "@/lib/access/context";
import { getSignatureOf } from "@/lib/access/org-mail";
import { sendEmail } from "@/lib/mailer-client";
import { getSendingModuleConfig, getSendingSmtp } from "@/lib/mail-config";
import {
  sendEmailSchema,
  bulkSendSchema,
  sendAllSchema,
  type SendEmailFormData,
  type BulkSendFormData,
  type SendAllFormData,
} from "@/lib/validations";
import type { EmailSendStatus, EmailType, EmailReason, ModuleType, Prisma } from "@prisma/client";

/** Resolve the subject/body template for a dossier, with module-default fallback. */
async function resolveTemplateForDossier(
  ownerId: string,
  dossierId: string,
  moduleType: ModuleType
): Promise<{ subject: string; body: string } | null> {
  const userId = ownerId;
  const dossier = await db.dossier.findFirst({
    where: { id: dossierId, userId },
    select: {
      defaultTemplate: { select: { subject: true, body: true } },
    },
  });

  if (dossier?.defaultTemplate) {
    return { subject: dossier.defaultTemplate.subject, body: dossier.defaultTemplate.body };
  }

  // Fallback: module default template (isDefault = true, category = moduleType)
  const fallback = await db.emailTemplate.findFirst({
    where: { userId, dossierId: null, category: moduleType, isDefault: true },
    select: { subject: true, body: true },
  });

  return fallback ?? null;
}

/** One signature lookup per MJPM during a bulk send. */
function signatureCache(): (ownerId: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (ownerId) => {
    const cached = cache.get(ownerId);
    if (cached) return cached;
    const next = getSignatureOf(ownerId);
    cache.set(ownerId, next);
    return next;
  };
}

/** Delete all documents from a dossier (DB records + files on disk). */
async function clearDossierDocuments(dossierId: string, userId: string): Promise<void> {
  const documents = await db.document.findMany({
    where: { dossierId, userId },
    select: { id: true, blobUrl: true },
  });

  // Delete files from disk (a file already gone is ignored)
  for (const doc of documents) {
    await removeDocumentFile(doc.blobUrl);
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
  /** Who clicked send, when it was not the dossier's MJPM (an assistant). */
  sentByName: string | null;
};

type LoadedEvent = Awaited<ReturnType<typeof loadEvents>>[number];

function loadEvents(where: Prisma.EmailSendEventWhereInput) {
  return db.emailSendEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { dossier: { select: { fullName: true } } },
  });
}

/** Names of the people who sent on behalf of someone else. */
async function senderNames(events: LoadedEvent[]): Promise<Map<string, string>> {
  const ids = [...new Set(events.filter((e) => e.sentById && e.sentById !== e.userId).map((e) => e.sentById as string))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

async function toEmailEvents(events: LoadedEvent[]): Promise<EmailEvent[]> {
  const names = await senderNames(events);
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
    sentByName: event.sentById ? names.get(event.sentById) ?? null : null,
  }));
}

export type BulkSendResult = {
  dossierId: string;
  success: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Fetch email history for a specific dossier
// ---------------------------------------------------------------------------
export async function getDossierEmails(dossierId: string): Promise<EmailEvent[]> {
  const { ownerIds } = await requireOwnerScope();
  return toEmailEvents(await loadEvents({ userId: { in: ownerIds }, dossierId }));
}

// ---------------------------------------------------------------------------
// Fetch email history filtered by module type
// ---------------------------------------------------------------------------
export async function getModuleEmailHistory(
  moduleType: "APA" | "ASH"
): Promise<EmailEvent[]> {
  const { ownerIds } = await requireOwnerScope({ narrowed: true });
  return toEmailEvents(await loadEvents({ userId: { in: ownerIds }, moduleType }));
}

// ---------------------------------------------------------------------------
// Send a single email (module-aware)
// ---------------------------------------------------------------------------
export async function sendEmailAction(
  data: SendEmailFormData
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const { actorId, ownerIds } = await requireOwnerScope();
    if (ownerIds.length === 0) return { success: false, error: "Ce compte n'a pas acces aux dossiers" };
    const validated = sendEmailSchema.parse(data);

    const smtpConfig = await getSendingSmtp(actorId);
    if (!smtpConfig) {
      return { success: false, error: "Configuration SMTP non definie" };
    }

    // Dossier name for placeholders; its MJPM owns the email record and signs.
    let dossierName: string | undefined;
    let ownerId = actorId;
    if (validated.dossierId) {
      const dossier = await db.dossier.findFirst({
        where: { id: validated.dossierId, userId: { in: ownerIds } },
        select: { fullName: true, userId: true },
      });
      if (!dossier) return { success: false, error: "Dossier non trouve" };
      dossierName = dossier.fullName;
      ownerId = dossier.userId;
    }
    const signature = await getSignatureOf(ownerId);

    const batch = await db.emailBatch.create({
      data: {
        userId: actorId,
        moduleType: validated.moduleType ?? null,
        description: `Email a ${validated.recipients.join(", ")}`,
      },
    });

    // Fetch module config for IMAP folder
    let imapFolder: string | undefined;
    if (validated.moduleType) {
      const moduleConfig = await getSendingModuleConfig(actorId, validated.moduleType as ModuleType);
      imapFolder = moduleConfig?.imapFolder ?? undefined;
    }

    // Resolve attachment URLs if provided
    let attachmentPaths: string[] = [];
    let allowedAttachmentIds: string[] = [];
    if (validated.attachmentIds.length > 0) {
      const documents = await db.document.findMany({
        where: {
          id: { in: validated.attachmentIds },
          userId: { in: ownerIds },
        },
      });
      attachmentPaths = attachmentPathsFor(documents.map((d) => d.blobUrl));
      allowedAttachmentIds = documents.map((d) => d.id);
    }

    const event = await db.emailSendEvent.create({
      data: {
        userId: ownerId,
        sentById: actorId,
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
          create: allowedAttachmentIds.map((docId) => ({
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
      trimestre: validated.trimestre,
      mois: validated.mois,
      annee: validated.annee,
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
  const { actorId, ownerIds } = await requireOwnerScope();
  // BulkSendFormData no longer carries subject/body — resolved per-dossier below
  const validated = bulkSendSchema.parse(data);
  const signatureOf = signatureCache();

  const smtpConfig = await getSendingSmtp(actorId);
  if (!smtpConfig) {
    return validated.dossierIds.map((dossierId) => ({
      dossierId,
      success: false,
      error: "Configuration SMTP non definie",
    }));
  }

  // Get the module destination email (government organism)
  const moduleConfig = await getSendingModuleConfig(actorId, validated.moduleType as ModuleType);
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
      userId: actorId,
      moduleType: validated.moduleType,
      description: `Envoi groupe ${validated.moduleType} - ${validated.dossierIds.length} dossiers`,
    },
  });

  const results: BulkSendResult[] = [];

  for (const dossierId of validated.dossierIds) {
    try {
      const dossier = await db.dossier.findFirst({
        where: { id: dossierId, userId: { in: ownerIds } },
        select: {
          id: true,
          userId: true,
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

      // Resolve template for this specific dossier
      const tpl = await resolveTemplateForDossier(dossier.userId, dossierId, validated.moduleType as ModuleType);
      if (!tpl) {
        results.push({
          dossierId,
          success: false,
          error: "Aucun modèle configuré et aucun modèle par défaut disponible",
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
          userId: dossier.userId,
          sentById: actorId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: validated.moduleType,
          emailType: "STANDARD",
          recipients,
          ccRecipients,
          bccRecipients: dossier.bccEmails,
          subject: tpl.subject,
          body: tpl.body,
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
        subject: tpl.subject,
        body: tpl.body,
        attachmentPaths: attachmentPathsFor(dossier.documents.map((d) => d.blobUrl)),
        signature: await signatureOf(dossier.userId),
        moduleType: validated.moduleType as "APA" | "ASH",
        dossierName: dossier.fullName,
        imapFolder: moduleConfig.imapFolder ?? undefined,
        trimestre: validated.trimestre,
        annee: validated.annee,
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
        await clearDossierDocuments(dossierId, dossier.userId);
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
  const { ownerIds } = await requireOwnerScope();

  const originalEvent = await db.emailSendEvent.findFirst({
    where: { id: eventId, userId: { in: ownerIds } },
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
  data: SendAllFormData
): Promise<BulkSendResult[]> {
  const { actorId, ownerIds } = await requireOwnerScope({ narrowed: true });
  const validated = sendAllSchema.parse(data);
  const signatureOf = signatureCache();

  const smtpConfig = await getSendingSmtp(actorId);
  if (!smtpConfig) {
    return [{ dossierId: "", success: false, error: "Configuration SMTP non definie" }];
  }

  const moduleConfig = await getSendingModuleConfig(actorId, validated.moduleType as ModuleType);
  if (!moduleConfig?.destinationEmail) {
    return [{ dossierId: "", success: false, error: "Email de destination non configure dans les parametres" }];
  }

  // Fetch all active dossiers with at least one document
  const dossiers = await db.dossier.findMany({
    where: {
      userId: { in: ownerIds },
      moduleType: validated.moduleType,
      status: "ACTIVE",
      documents: { some: {} },
    },
    select: {
      id: true,
      userId: true,
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
      userId: actorId,
      moduleType: validated.moduleType,
      description: `Envoi total ${validated.moduleType} - ${dossiers.length} dossiers`,
    },
  });

  const results: BulkSendResult[] = [];

  for (const dossier of dossiers) {
    try {
      const tpl = await resolveTemplateForDossier(dossier.userId, dossier.id, validated.moduleType as ModuleType);
      if (!tpl) {
        results.push({
          dossierId: dossier.id,
          success: false,
          error: "Aucun modèle configuré et aucun modèle par défaut disponible",
        });
        continue;
      }

      const recipients = [moduleConfig.destinationEmail];
      const ccRecipients = [
        ...(dossier.primaryEmail ? [dossier.primaryEmail] : []),
        ...dossier.ccEmails,
      ];

      const event = await db.emailSendEvent.create({
        data: {
          userId: dossier.userId,
          sentById: actorId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: validated.moduleType,
          emailType: "STANDARD",
          recipients,
          ccRecipients,
          bccRecipients: dossier.bccEmails,
          subject: tpl.subject,
          body: tpl.body,
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
        subject: tpl.subject,
        body: tpl.body,
        attachmentPaths: attachmentPathsFor(dossier.documents.map((d) => d.blobUrl)),
        signature: await signatureOf(dossier.userId),
        moduleType: validated.moduleType as "APA" | "ASH",
        dossierName: dossier.fullName,
        imapFolder: moduleConfig.imapFolder ?? undefined,
        trimestre: validated.trimestre,
        annee: validated.annee,
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
        await clearDossierDocuments(dossier.id, dossier.userId);
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
