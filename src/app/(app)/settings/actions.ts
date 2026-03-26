"use server";

import { revalidatePath } from "next/cache";
import { hash, compare } from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/encryption";
import {
  smtpConfigSchema,
  emailTemplateSchema,
  type SmtpConfigFormData,
  type EmailTemplateFormData,
} from "@/lib/validations";
import type { SmtpProvider, TemplateCategory, ModuleType } from "@prisma/client";

// SMTP Config types
export type SmtpConfigData = {
  id: string;
  provider: SmtpProvider;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
} | null;

// Get SMTP config (without password)
export async function getSmtpConfig(): Promise<SmtpConfigData> {
  const userId = await requireAuth();

  const config = await db.smtpConfig.findUnique({
    where: { userId },
    select: {
      id: true,
      provider: true,
      smtpHost: true,
      smtpPort: true,
      secure: true,
      username: true,
      fromName: true,
      fromEmail: true,
    },
  });

  return config;
}

// Get full SMTP config with decrypted password (server-side only)
export async function getSmtpConfigWithPassword(): Promise<{
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
} | null> {
  const userId = await requireAuth();

  const config = await db.smtpConfig.findUnique({
    where: { userId },
  });

  if (!config) return null;

  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.secure,
    username: config.username,
    password: decrypt(config.encryptedPassword),
    fromName: config.fromName,
    fromEmail: config.fromEmail,
  };
}

/** Convert raw SMTP errors into plain French messages. */
function humanizeSmtpError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (error as any)?.code ?? "";
  if (code === "ECONNREFUSED") return "Connexion refusée — vérifiez l'hôte et le port.";
  if (code === "ENOTFOUND") return "Serveur introuvable — vérifiez l'adresse SMTP.";
  if (code === "ETIMEDOUT" || code === "ECONNRESET") return "Délai dépassé — vérifiez le port et votre réseau.";
  if (msg.includes("535") || msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("username and password"))
    return "Identifiants incorrects — vérifiez votre adresse email et mot de passe.";
  if (msg.includes("534") || msg.toLowerCase().includes("application-specific"))
    return "Gmail : utilisez un mot de passe d'application, pas votre mot de passe principal.";
  if (msg.toLowerCase().includes("certificate") || msg.toLowerCase().includes("self-signed"))
    return "Erreur de certificat SSL — connexion non sécurisée.";
  return `Erreur de connexion : ${msg}`;
}

// Test SMTP connection (no email sent)
export async function testSmtpConnection(
  data: SmtpConfigFormData
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAuth();
    const validated = smtpConfigSchema.parse(data);

    const transporter = nodemailer.createTransport({
      host: validated.smtpHost,
      port: validated.smtpPort,
      // Port 465 = SSL, anything else = STARTTLS (nodemailer default)
      secure: validated.smtpPort === 465,
      auth: { user: validated.username, pass: validated.password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
    });

    await transporter.verify();
    return { success: true, message: "Connexion réussie — votre configuration SMTP est valide." };
  } catch (error) {
    console.error("[testSmtpConnection]", error);
    return { success: false, message: humanizeSmtpError(error) };
  }
}

// Save SMTP config
export async function saveSmtpConfig(
  data: SmtpConfigFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = smtpConfigSchema.parse(data);

    const encryptedPassword = encrypt(validated.password);

    await db.smtpConfig.upsert({
      where: { userId },
      create: {
        userId,
        provider: validated.provider,
        smtpHost: validated.smtpHost,
        smtpPort: validated.smtpPort,
        secure: validated.secure,
        username: validated.username,
        encryptedPassword,
        fromName: validated.fromName,
        fromEmail: validated.fromEmail,
      },
      update: {
        provider: validated.provider,
        smtpHost: validated.smtpHost,
        smtpPort: validated.smtpPort,
        secure: validated.secure,
        username: validated.username,
        encryptedPassword,
        fromName: validated.fromName,
        fromEmail: validated.fromEmail,
      },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error saving SMTP config:", error);
    return { success: false, error: "Erreur lors de l'enregistrement" };
  }
}

// Template types
export type TemplateData = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: TemplateCategory;
  isDefault: boolean;
};

// Get templates
export async function getTemplates(): Promise<TemplateData[]> {
  const userId = await requireAuth();

  const templates = await db.emailTemplate.findMany({
    where: { userId, dossierId: null }, // Only global templates
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subject: true,
      body: true,
      category: true,
      isDefault: true,
    },
  });

  return templates;
}

// Create template
export async function createTemplate(
  data: EmailTemplateFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = emailTemplateSchema.parse(data);

    const template = await db.emailTemplate.create({
      data: {
        ...validated,
        userId,
      },
    });

    revalidatePath("/settings");
    return { success: true, id: template.id };
  } catch (error) {
    console.error("Error creating template:", error);
    return { success: false, error: "Erreur lors de la création" };
  }
}

// Update template
export async function updateTemplate(
  id: string,
  data: Partial<EmailTemplateFormData>
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    // Verify ownership
    const existing = await db.emailTemplate.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return { success: false, error: "Modèle non trouvé" };
    }

    const validated = emailTemplateSchema.partial().parse(data);

    await db.emailTemplate.update({
      where: { id },
      data: validated,
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error updating template:", error);
    return { success: false, error: "Erreur lors de la mise à jour" };
  }
}

// Delete template
export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    // Verify ownership
    const existing = await db.emailTemplate.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return { success: false, error: "Modèle non trouvé" };
    }

    await db.emailTemplate.delete({
      where: { id },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error deleting template:", error);
    return { success: false, error: "Erreur lors de la suppression" };
  }
}

// Module Config types
export type ModuleConfigData = {
  id: string;
  moduleType: ModuleType;
  destinationEmail: string;
  imapFolder: string | null;
} | null;

// Get module config
export async function getModuleConfig(
  moduleType: ModuleType
): Promise<ModuleConfigData> {
  const userId = await requireAuth();

  const config = await db.moduleConfig.findUnique({
    where: {
      userId_moduleType: {
        userId,
        moduleType,
      },
    },
    select: {
      id: true,
      moduleType: true,
      destinationEmail: true,
      imapFolder: true,
    },
  });

  return config;
}

// Get all module configs
export async function getAllModuleConfigs(): Promise<{
  apa: ModuleConfigData;
  ash: ModuleConfigData;
}> {
  const userId = await requireAuth();

  const configs = await db.moduleConfig.findMany({
    where: { userId },
    select: {
      id: true,
      moduleType: true,
      destinationEmail: true,
      imapFolder: true,
    },
  });

  return {
    apa: configs.find((c) => c.moduleType === "APA") || null,
    ash: configs.find((c) => c.moduleType === "ASH") || null,
  };
}

// Save module config
export async function saveModuleConfig(
  moduleType: ModuleType,
  destinationEmail: string,
  imapFolder?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    await db.moduleConfig.upsert({
      where: {
        userId_moduleType: {
          userId,
          moduleType,
        },
      },
      create: {
        userId,
        moduleType,
        destinationEmail,
        imapFolder: imapFolder || null,
      },
      update: {
        destinationEmail,
        imapFolder: imapFolder || null,
      },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error saving module config:", error);
    return { success: false, error: "Erreur lors de l'enregistrement" };
  }
}

// Get templates by category
export async function getTemplatesByCategory(
  category: TemplateCategory
): Promise<TemplateData[]> {
  const userId = await requireAuth();

  const templates = await db.emailTemplate.findMany({
    where: {
      userId,
      dossierId: null,
      category,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subject: true,
      body: true,
      category: true,
      isDefault: true,
    },
  });

  return templates;
}

// ── General Settings (Password + Signature) ──

export async function getSignature(): Promise<string> {
  const userId = await requireAuth();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { signature: true },
  });
  return user?.signature ?? "";
}

export async function updateSignature(
  signature: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();
    await db.user.update({
      where: { id: userId },
      data: { signature },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Error updating signature:", error);
    return { success: false, error: "Erreur lors de la mise a jour" };
  }
}

export async function updatePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return { success: false, error: "Compte sans mot de passe" };
    }

    const isValid = await compare(data.currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Mot de passe actuel incorrect" };
    }

    if (data.newPassword.length < 8) {
      return {
        success: false,
        error: "Le nouveau mot de passe doit contenir au moins 8 caracteres",
      };
    }

    const newHash = await hash(data.newPassword, 12);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating password:", error);
    return { success: false, error: "Erreur lors de la mise a jour" };
  }
}
