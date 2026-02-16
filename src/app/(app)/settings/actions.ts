"use server";

import { revalidatePath } from "next/cache";
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
  destinationEmail: string
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
      },
      update: {
        destinationEmail,
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
