"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { requireAdmin, startImpersonation, stopImpersonation } from "@/lib/auth";
import { z } from "zod";
import { seedGlobalTemplates } from "@/lib/default-templates";
import { encrypt, decrypt } from "@/lib/encryption";
import { systemConfigSchema, type SystemConfigFormData, broadcastEmailSchema, type BroadcastEmailFormData } from "@/lib/validations";
import { sendEmail } from "@/lib/mailer-client";
import {
  DEFAULT_UPDATE_ENDPOINTS,
  getSavedUpdateEndpoint,
  inspectUpdateManifest,
  saveUpdateEndpoint,
  type ManifestCheck,
} from "@/lib/update-endpoints";
import { finishPaymentTest, startPaymentTest, type PaymentTestOutcome } from "@/lib/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminUserData = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  billingRequired: boolean;
  billingCustomAmountCents: number | null;
  billingStartsAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    dossiers: number;
    documents: number;
  };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.string().email("Email invalide"),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caracteres").optional(),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caracteres"),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  billingRequired: z.boolean().default(false),
  billingCustomAmountCents: z.number().int().positive().max(10_000_000).nullable().default(null),
});

const updateUserSchema = z.object({
  email: z.string().email("Email invalide").optional(),
  name: z.string().min(2).optional().nullable(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caracteres")
    .optional()
    .or(z.literal("")),
  role: z.enum(["USER", "ADMIN"]).optional(),
  billingRequired: z.boolean().optional(),
  billingCustomAmountCents: z.number().int().positive().max(10_000_000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** List all users (admin only) */
export async function getUsers(): Promise<AdminUserData[]> {
  await requireAdmin();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      billingRequired: true,
      billingCustomAmountCents: true,
      billingStartsAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          dossiers: true,
          documents: true,
        },
      },
    },
  });

  return users;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "YYYY-MM-DD" from the admin form -> Date (noon UTC). Must fit Stripe's trial
 * limits: more than 48 h away (3 days keeps a margin for the client to register
 * their card) and at most 2 years. undefined = unchanged, null/"" = cleared.
 */
function parseBillingStart(
  value: string | null | undefined
): { date: Date | null | undefined } | { error: string } {
  if (value === undefined) return { date: undefined };
  if (value === null || value === "") return { date: null };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(Number.NaN);
  const ms = date.getTime() - Date.now();
  if (Number.isNaN(ms)) return { error: "Date de premier prélèvement invalide." };
  if (ms < 3 * DAY_MS) return { error: "La date de premier prélèvement doit être au moins 3 jours après aujourd'hui." };
  if (ms > 730 * DAY_MS) return { error: "La date de premier prélèvement ne peut pas dépasser 2 ans." };
  return { date };
}

/** Create a new user (admin only) */
export async function createUser(data: {
  email: string;
  name?: string;
  password: string;
  role?: "USER" | "ADMIN";
  billingRequired?: boolean;
  billingCustomAmountCents?: number | null;
  billingStartsAt?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireAdmin();
    const validated = createUserSchema.parse(data);
    const start = parseBillingStart(data.billingRequired ? data.billingStartsAt : null);
    if ("error" in start) return { success: false, error: start.error };

    const existing = await db.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    if (existing) {
      return { success: false, error: "Cet email est deja utilise" };
    }

    const passwordHash = await hash(validated.password, 12);

    const user = await db.user.create({
      data: {
        email: validated.email.toLowerCase(),
        name: validated.name ?? null,
        passwordHash,
        role: validated.role ?? "USER",
        billingRequired: validated.billingRequired,
        billingCustomAmountCents: validated.billingCustomAmountCents,
        billingStartsAt: start.date ?? null,
      },
    });

    await seedGlobalTemplates();

    revalidatePath("/admin/users");
    return { success: true, id: user.id };
  } catch (error) {
    console.error("Error creating user:", error);
    return { success: false, error: "Erreur lors de la creation" };
  }
}

/** Update a user (admin only) */
export async function updateUser(
  userId: string,
  data: {
    email?: string;
    name?: string | null;
    password?: string;
    role?: "USER" | "ADMIN";
    billingRequired?: boolean;
    billingCustomAmountCents?: number | null;
    billingStartsAt?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validated = updateUserSchema.parse(data);

    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return { success: false, error: "Utilisateur introuvable" };
    }

    // Check email uniqueness if changing
    if (validated.email && validated.email.toLowerCase() !== existing.email) {
      const emailTaken = await db.user.findUnique({
        where: { email: validated.email.toLowerCase() },
      });
      if (emailTaken) {
        return { success: false, error: "Cet email est deja utilise" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (validated.email) updateData.email = validated.email.toLowerCase();
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.role) updateData.role = validated.role;
    if (validated.billingRequired !== undefined) updateData.billingRequired = validated.billingRequired;
    if (validated.billingCustomAmountCents !== undefined) {
      updateData.billingCustomAmountCents = validated.billingCustomAmountCents;
    }
    const start = parseBillingStart(data.billingStartsAt);
    if ("error" in start) return { success: false, error: start.error };
    if (start.date !== undefined) updateData.billingStartsAt = start.date;
    if (validated.password && validated.password.length > 0) {
      updateData.passwordHash = await hash(validated.password, 12);
    }

    await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Erreur lors de la mise a jour" };
  }
}

/** Archive a user (admin only) */
export async function archiveUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminId = await requireAdmin();

    if (userId === adminId) {
      return { success: false, error: "Vous ne pouvez pas archiver votre propre compte" };
    }

    await db.user.update({
      where: { id: userId },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error archiving user:", error);
    return { success: false, error: "Erreur lors de l'archivage" };
  }
}

/** Unarchive a user (admin only) */
export async function unarchiveUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await db.user.update({
      where: { id: userId },
      data: { archivedAt: null },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error unarchiving user:", error);
    return { success: false, error: "Erreur lors de la reactivation" };
  }
}

/** Start impersonation (admin only) */
export async function startImpersonationAction(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await startImpersonation(targetUserId);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return { success: false, error: "Erreur lors de la connexion au compte" };
  }
}

/** Stop impersonation (admin only) */
export async function stopImpersonationAction(): Promise<void> {
  await stopImpersonation();
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Global template management (admin only)
// ---------------------------------------------------------------------------

export type GlobalTemplateData = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: "APA" | "ASH" | "DERNIER_DECES" | "DERNIER_DESSAISISSEMENT" | "CUSTOM";
  isDefault: boolean;
};

export async function getGlobalTemplates(): Promise<GlobalTemplateData[]> {
  await requireAdmin();
  const templates = await db.emailTemplate.findMany({
    where: { isGlobal: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, subject: true, body: true, category: true, isDefault: true },
  });
  return templates as GlobalTemplateData[];
}

export async function createGlobalTemplate(data: {
  name: string;
  subject: string;
  body: string;
  category: "APA" | "ASH" | "DERNIER_DECES" | "DERNIER_DESSAISISSEMENT" | "CUSTOM";
  isDefault: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireAdmin();
    const template = await db.emailTemplate.create({
      data: { ...data, isGlobal: true, userId: null },
    });
    revalidatePath("/admin/users");
    return { success: true, id: template.id };
  } catch (error) {
    console.error("Error creating global template:", error);
    return { success: false, error: "Erreur lors de la création" };
  }
}

export async function updateGlobalTemplate(
  id: string,
  data: Partial<{ name: string; subject: string; body: string; isDefault: boolean }>
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const existing = await db.emailTemplate.findFirst({ where: { id, isGlobal: true } });
    if (!existing) return { success: false, error: "Modèle introuvable" };
    await db.emailTemplate.update({ where: { id }, data });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error updating global template:", error);
    return { success: false, error: "Erreur lors de la mise à jour" };
  }
}

export async function deleteGlobalTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const existing = await db.emailTemplate.findFirst({ where: { id, isGlobal: true } });
    if (!existing) return { success: false, error: "Modèle introuvable" };
    await db.emailTemplate.delete({ where: { id } });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error deleting global template:", error);
    return { success: false, error: "Erreur lors de la suppression" };
  }
}

// ---------------------------------------------------------------------------
// Broadcast email — admin sends a single email to every active user.
// Uses the ADMIN's own personal SmtpConfig (not the recovery SystemConfig),
// so the message comes from the admin's real identity. Recipients are BCC'd
// so users never see each other's email addresses.
// ---------------------------------------------------------------------------

/** Send an email to every active (non-archived) user. Admin only. */
export async function sendBroadcastEmail(
  data: BroadcastEmailFormData
): Promise<{ success: boolean; sentCount?: number; error?: string }> {
  try {
    const adminId = await requireAdmin();
    const validated = broadcastEmailSchema.parse(data);

    const admin = await db.user.findUnique({
      where: { id: adminId },
      select: { email: true, smtpConfig: true },
    });

    if (!admin?.smtpConfig) {
      return {
        success: false,
        error: "Configurez d'abord votre SMTP personnel dans Paramètres.",
      };
    }

    const activeUsers = await db.user.findMany({
      where: { archivedAt: null },
      select: { email: true },
    });

    const bccList = activeUsers
      .map((u) => u.email)
      .filter((email) => email !== admin.email);

    if (bccList.length === 0) {
      return { success: false, error: "Aucun destinataire actif à contacter." };
    }

    const smtpConfig = admin.smtpConfig;
    const result = await sendEmail({
      smtp: {
        host: smtpConfig.smtpHost,
        port: smtpConfig.smtpPort,
        secure: smtpConfig.secure,
        username: smtpConfig.username,
        password: decrypt(smtpConfig.encryptedPassword),
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.fromEmail,
      },
      recipients: [admin.email],
      bccRecipients: bccList,
      subject: validated.subject,
      body: validated.body,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Échec de l'envoi" };
    }

    return { success: true, sentCount: bccList.length };
  } catch (error) {
    console.error("Error sending broadcast email:", error);
    return { success: false, error: "Erreur lors de l'envoi" };
  }
}

// ---------------------------------------------------------------------------
// System SMTP config — app-wide, used only for account-recovery emails.
// Admin-only. Independent of each user's personal SmtpConfig.
// ---------------------------------------------------------------------------

const SYSTEM_CONFIG_ID = "system";

export type SystemConfigData = {
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
} | null;

/** Get the system recovery-email SMTP config (without password), admin only. */
export async function getSystemConfig(): Promise<SystemConfigData> {
  await requireAdmin();

  const config = await db.systemConfig.findUnique({
    where: { id: SYSTEM_CONFIG_ID },
    select: {
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

function humanizeSystemSmtpError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (error as any)?.code ?? "";
  if (code === "ECONNREFUSED") return "Connexion refusée — vérifiez l'hôte et le port.";
  if (code === "ENOTFOUND") return "Serveur introuvable — vérifiez l'adresse SMTP.";
  if (code === "ETIMEDOUT" || code === "ECONNRESET") return "Délai dépassé — vérifiez le port et votre réseau.";
  if (
    msg.includes("535") ||
    msg.toLowerCase().includes("invalid credentials") ||
    msg.toLowerCase().includes("username and password")
  )
    return "Identifiants incorrects — vérifiez l'adresse email et le mot de passe.";
  if (msg.toLowerCase().includes("certificate") || msg.toLowerCase().includes("self-signed"))
    return "Erreur de certificat SSL — connexion non sécurisée.";
  return `Erreur de connexion : ${msg}`;
}

/** Test the system recovery SMTP connection without saving or sending an email. Admin only. */
export async function testSystemSmtpConnection(
  data: SystemConfigFormData
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
    const validated = systemConfigSchema.parse(data);

    const transporter = nodemailer.createTransport({
      host: validated.smtpHost,
      port: validated.smtpPort,
      secure: validated.smtpPort === 465,
      auth: { user: validated.username, pass: validated.password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
    });

    await transporter.verify();
    return { success: true, message: "Connexion réussie — la configuration est valide." };
  } catch (error) {
    const message = humanizeSystemSmtpError(error);
    // Log only the humanized message — raw SMTP errors can embed base64 auth credentials.
    console.error("[testSystemSmtpConnection]", message);
    return { success: false, message };
  }
}

/** Save the system recovery SMTP config. Admin only. */
export async function saveSystemConfig(
  data: SystemConfigFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validated = systemConfigSchema.parse(data);

    const encryptedPassword = encrypt(validated.password);

    await db.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_ID },
      create: {
        id: SYSTEM_CONFIG_ID,
        smtpHost: validated.smtpHost,
        smtpPort: validated.smtpPort,
        secure: validated.secure,
        username: validated.username,
        encryptedPassword,
        fromName: validated.fromName,
        fromEmail: validated.fromEmail,
      },
      update: {
        smtpHost: validated.smtpHost,
        smtpPort: validated.smtpPort,
        secure: validated.secure,
        username: validated.username,
        encryptedPassword,
        fromName: validated.fromName,
        fromEmail: validated.fromEmail,
      },
    });

    revalidatePath("/admin/system-config");
    return { success: true };
  } catch (error) {
    console.error("Error saving system config:", error);
    return { success: false, error: "Erreur lors de l'enregistrement" };
  }
}

// ---------------------------------------------------------------------------
// Update channel URL — where desktop installs look for latest.json.
// Admin-only. See lib/update-endpoints.ts.
// ---------------------------------------------------------------------------

export type UpdaterSettingsData = {
  savedEndpoint: string | null;
  defaultEndpoints: string[];
};

export async function getUpdaterSettings(): Promise<UpdaterSettingsData> {
  await requireAdmin();
  return {
    savedEndpoint: await getSavedUpdateEndpoint(),
    defaultEndpoints: [...DEFAULT_UPDATE_ENDPOINTS],
  };
}

/** Fetches the manifest at `url` so the admin never saves a broken address. */
export async function testUpdaterEndpoint(url: string): Promise<ManifestCheck> {
  await requireAdmin();
  return inspectUpdateManifest(url.trim());
}

/** Saves the update URL after checking it serves a manifest; null restores the defaults. */
export async function saveUpdaterEndpoint(
  url: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (url === null) {
      await saveUpdateEndpoint(null);
    } else {
      const check = await inspectUpdateManifest(url.trim());
      if (!check.ok) return { success: false, error: check.error };
      await saveUpdateEndpoint(url.trim());
    }
    revalidatePath("/admin/system-config");
    return { success: true };
  } catch (error) {
    console.error("Error saving update endpoint:", error);
    return { success: false, error: "Erreur lors de l'enregistrement" };
  }
}

// ---------------------------------------------------------------------------
// Payment test — real Stripe Checkout at 0 €, admin only.
// ---------------------------------------------------------------------------

/** Returns the Stripe Checkout URL of a 0 € test subscription for the real admin. */
export async function startPaymentTestAction(): Promise<{ url?: string; error?: string }> {
  try {
    const adminId = await requireAdmin();
    const result = await startPaymentTest(adminId, "/admin/system-config");
    return "url" in result ? { url: result.url } : { error: result.error };
  } catch {
    return { error: "Réservé aux administrateurs." };
  }
}

/** Called on return from Stripe: confirms the test and cancels the 0 € subscription. */
export async function finishPaymentTestAction(sessionId: string): Promise<PaymentTestOutcome> {
  try {
    const adminId = await requireAdmin();
    return await finishPaymentTest(adminId, sessionId);
  } catch {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
}
