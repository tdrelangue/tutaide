"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword } from "../../settings/actions";

interface SendDernierEmailParams {
  dossierId: string;
  moduleType: "APA" | "ASH";
  reason: "DECES" | "DESSAISISSEMENT";
  recipients: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  subject: string;
  body: string;
}

export async function sendDernierEmail(
  params: SendDernierEmailParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    // Validate that the dossier exists and belongs to the user
    const dossier = await db.dossier.findFirst({
      where: { id: params.dossierId, userId },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouve" };
    }

    // Get SMTP configuration
    const smtpConfig = await getSmtpConfigWithPassword();
    if (!smtpConfig) {
      return { success: false, error: "Configuration SMTP non definie" };
    }

    // Create a batch to group this dernier email event
    const batch = await db.emailBatch.create({
      data: {
        userId,
        moduleType: params.moduleType,
        description: `Dernier email (${params.reason === "DECES" ? "Deces" : "Dessaisissement"}) - ${dossier.fullName}`,
      },
    });

    const ccRecipients = params.ccRecipients ?? [];
    const bccRecipients = params.bccRecipients ?? [];

    // Create the send event with DERNIER type and reason
    const event = await db.emailSendEvent.create({
      data: {
        userId,
        dossierId: params.dossierId,
        batchId: batch.id,
        status: "PENDING",
        moduleType: params.moduleType,
        emailType: "DERNIER",
        emailReason: params.reason,
        recipients: params.recipients,
        ccRecipients,
        bccRecipients,
        subject: params.subject,
        body: params.body,
      },
    });

    // Send the email via the mailer service
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
      recipients: params.recipients,
      ccRecipients,
      bccRecipients,
      subject: params.subject,
      body: params.body,
    });

    // Update event status based on send result
    await db.emailSendEvent.update({
      where: { id: event.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error || null,
        sentAt: result.success ? new Date() : null,
      },
    });

    if (!result.success) {
      return { success: false, error: result.error || "Echec de l'envoi" };
    }

    // On successful send, close the dossier
    await db.dossier.update({
      where: { id: params.dossierId },
      data: { status: "CLOSED" },
    });

    // Revalidate all relevant paths
    const moduleSlug = params.moduleType.toLowerCase();
    revalidatePath(`/${moduleSlug}/dossiers`);
    revalidatePath(`/${moduleSlug}/history`);
    revalidatePath("/history");
    revalidatePath("/dossiers");

    return { success: true };
  } catch (error) {
    console.error("Error sending dernier email:", error);
    return { success: false, error: "Erreur lors de l'envoi du dernier email" };
  }
}
