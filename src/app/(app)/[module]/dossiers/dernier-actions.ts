"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword, getModuleConfig } from "../../settings/actions";
import type { ModuleType } from "@prisma/client";

interface SendDernierEmailParams {
  dossierId: string;
  moduleType: "APA" | "ASH";
  reason: "DECES" | "DESSAISISSEMENT";
  subject: string;
  body: string;
}

export async function sendDernierEmail(
  params: SendDernierEmailParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { signature: true },
    });
    const signature = user?.signature ?? "";

    const dossier = await db.dossier.findFirst({
      where: { id: params.dossierId, userId },
      select: {
        id: true,
        fullName: true,
        primaryEmail: true,
        ccEmails: true,
        bccEmails: true,
      },
    });

    if (!dossier) {
      return { success: false, error: "Dossier non trouve" };
    }

    const smtpConfig = await getSmtpConfigWithPassword();
    if (!smtpConfig) {
      return { success: false, error: "Configuration SMTP non definie" };
    }

    // TO = government destination email
    const moduleConfig = await getModuleConfig(params.moduleType as ModuleType);
    if (!moduleConfig?.destinationEmail) {
      return { success: false, error: "Email de destination non configure dans les parametres" };
    }

    const recipients = [moduleConfig.destinationEmail];
    const ccRecipients = [
      ...(dossier.primaryEmail ? [dossier.primaryEmail] : []),
      ...dossier.ccEmails,
    ];
    const bccRecipients = dossier.bccEmails;

    const batch = await db.emailBatch.create({
      data: {
        userId,
        moduleType: params.moduleType,
        description: `Dernier email (${params.reason === "DECES" ? "Deces" : "Dessaisissement"}) - ${dossier.fullName}`,
      },
    });

    const event = await db.emailSendEvent.create({
      data: {
        userId,
        dossierId: params.dossierId,
        batchId: batch.id,
        status: "PENDING",
        moduleType: params.moduleType,
        emailType: "DERNIER",
        emailReason: params.reason,
        recipients,
        ccRecipients,
        bccRecipients,
        subject: params.subject,
        body: params.body,
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
      recipients,
      ccRecipients,
      bccRecipients,
      subject: params.subject,
      body: params.body,
      signature,
      moduleType: params.moduleType,
      dossierName: dossier.fullName,
      imapFolder: moduleConfig.imapFolder ?? undefined,
    });

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

    await db.dossier.update({
      where: { id: params.dossierId },
      data: { status: "CLOSED" },
    });

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
