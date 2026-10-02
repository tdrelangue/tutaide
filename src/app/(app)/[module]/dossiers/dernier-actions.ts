"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer-client";
import { getSmtpConfigWithPassword, getModuleConfig } from "../../settings/actions";
import type { ModuleType } from "@prisma/client";

interface SendDernierEmailParams {
  /** Primary dossier plus any linked dossiers the user opted to also close. */
  dossierIds: string[];
  reason: "DECES" | "DESSAISISSEMENT";
  subject: string;
  body: string;
}

export type DernierEmailResult = {
  dossierId: string;
  moduleType: ModuleType;
  success: boolean;
  error?: string;
};

/** Sends the same closing notice to each given dossier's own organism and closes each independently. */
export async function sendDernierEmail(
  params: SendDernierEmailParams
): Promise<DernierEmailResult[]> {
  const userId = await requireAuth();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { signature: true },
  });
  const signature = user?.signature ?? "";

  const smtpConfig = await getSmtpConfigWithPassword();
  if (!smtpConfig) {
    return params.dossierIds.map((dossierId) => ({
      dossierId,
      moduleType: "APA" as ModuleType,
      success: false,
      error: "Configuration SMTP non definie",
    }));
  }

  const batch = await db.emailBatch.create({
    data: {
      userId,
      description: `Dernier email (${params.reason === "DECES" ? "Deces" : "Dessaisissement"})`,
    },
  });

  const results: DernierEmailResult[] = [];

  for (const dossierId of params.dossierIds) {
    try {
      const dossier = await db.dossier.findFirst({
        where: { id: dossierId, userId },
        select: {
          id: true,
          fullName: true,
          moduleType: true,
          primaryEmail: true,
          ccEmails: true,
          bccEmails: true,
        },
      });

      if (!dossier) {
        results.push({
          dossierId,
          moduleType: "APA" as ModuleType,
          success: false,
          error: "Dossier non trouve",
        });
        continue;
      }

      const moduleConfig = await getModuleConfig(dossier.moduleType);
      if (!moduleConfig?.destinationEmail) {
        results.push({
          dossierId,
          moduleType: dossier.moduleType,
          success: false,
          error: "Email de destination non configure dans les parametres",
        });
        continue;
      }

      const recipients = [moduleConfig.destinationEmail];
      const ccRecipients = [
        ...(dossier.primaryEmail ? [dossier.primaryEmail] : []),
        ...dossier.ccEmails,
      ];
      const bccRecipients = dossier.bccEmails;

      const event = await db.emailSendEvent.create({
        data: {
          userId,
          dossierId: dossier.id,
          batchId: batch.id,
          status: "PENDING",
          moduleType: dossier.moduleType,
          emailType: "DERNIER",
          emailReason: params.reason,
          recipients,
          ccRecipients,
          bccRecipients,
          subject: params.subject,
          body: params.body,
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
        bccRecipients,
        subject: params.subject,
        body: params.body,
        signature,
        // SendEmailPayload.moduleType is typed APA|ASH only (unused for branching,
        // only forwarded); PCH dossiers pass through the same way.
        moduleType: dossier.moduleType as "APA" | "ASH",
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

      if (sendResult.success) {
        await db.dossier.update({
          where: { id: dossier.id },
          data: { status: "CLOSED" },
        });
      }

      results.push({
        dossierId: dossier.id,
        moduleType: dossier.moduleType,
        success: sendResult.success,
        error: sendResult.error,
      });
    } catch (error) {
      console.error(`Error sending dernier email for dossier ${dossierId}:`, error);
      results.push({
        dossierId,
        moduleType: "APA" as ModuleType,
        success: false,
        error: "Erreur lors de l'envoi du dernier email",
      });
    }
  }

  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");
  revalidatePath("/pch/dossiers");
  revalidatePath("/apa/history");
  revalidatePath("/ash/history");
  revalidatePath("/pch/history");
  revalidatePath("/history");
  revalidatePath("/dossiers");

  return results;
}
