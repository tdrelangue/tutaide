import { z } from "zod";

// Auth
export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").optional(),
});

// Dossier
export const dossierSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis"),
  moduleType: z.enum(["APA", "ASH"]).default("APA"),
  priority: z.enum(["NORMAL", "PRIORITAIRE", "URGENT"]).default("NORMAL"),
  status: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE"),
  notes: z.string().optional(),
  primaryEmail: z.string().email("Email invalide").optional().or(z.literal("")),
  ccEmails: z.array(z.string().email()).default([]),
  bccEmails: z.array(z.string().email()).default([]),
  addToOtherModule: z.boolean().default(false),
  defaultTemplateId: z.string().optional().nullable(),
  sendingFrequency: z.enum(["MONTHLY", "QUARTERLY", "BIMONTHLY"]).default("QUARTERLY"),
});

export type DossierFormData = z.infer<typeof dossierSchema>;

// Email Template
export const emailTemplateSchema = z.object({
  name: z.string().min(2, "Le nom du modèle est requis"),
  subject: z.string().min(1, "L'objet est requis"),
  body: z.string().min(1, "Le contenu est requis"),
  category: z.enum(["APA", "ASH", "DERNIER_DECES", "DERNIER_DESSAISISSEMENT", "CUSTOM"]).default("APA"),
  isDefault: z.boolean().default(false),
});

export type EmailTemplateFormData = z.infer<typeof emailTemplateSchema>;

// SMTP Config
export const smtpConfigSchema = z.object({
  provider: z.enum(["GMAIL", "OUTLOOK", "OTHER"]).default("OTHER"),
  smtpHost: z.string().min(1, "L'hôte SMTP est requis"),
  smtpPort: z.coerce.number().int().positive().default(587),
  secure: z.boolean().default(true),
  username: z.string().min(1, "Le nom d'utilisateur est requis"),
  password: z.string().min(1, "Le mot de passe est requis"),
  fromName: z.string().min(1, "Le nom d'expéditeur est requis"),
  fromEmail: z.string().email("Email d'expéditeur invalide"),
});

export type SmtpConfigFormData = z.infer<typeof smtpConfigSchema>;

// Send Email
export const sendEmailSchema = z.object({
  dossierId: z.string().optional(),
  templateId: z.string().optional(),
  moduleType: z.enum(["APA", "ASH"]).optional(),
  emailType: z.enum(["STANDARD", "DERNIER"]).default("STANDARD"),
  emailReason: z.enum(["DECES", "DESSAISISSEMENT"]).optional(),
  recipients: z.array(z.string().email()).min(1, "Au moins un destinataire requis"),
  ccRecipients: z.array(z.string().email()).default([]),
  bccRecipients: z.array(z.string().email()).default([]),
  subject: z.string().min(1, "L'objet est requis"),
  body: z.string().min(1, "Le contenu est requis"),
  attachmentIds: z.array(z.string()).default([]),
});

export type SendEmailFormData = z.infer<typeof sendEmailSchema>;

// Bulk Send
export const bulkSendSchema = z.object({
  dossierIds: z.array(z.string()).min(1, "Au moins un dossier requis"),
  moduleType: z.enum(["APA", "ASH"]),
});

export type BulkSendFormData = z.infer<typeof bulkSendSchema>;

// Send All (all non-empty dossiers)
export const sendAllSchema = z.object({
  moduleType: z.enum(["APA", "ASH"]),
});

export type SendAllFormData = z.infer<typeof sendAllSchema>;
