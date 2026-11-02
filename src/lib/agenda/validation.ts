import { z } from "zod";
import { GROUP_COLORS } from "./groups-rules";

/** A place chosen from the geocoder's suggestions (never free text: it must have coordinates). */
export const placeSchema = z.object({
  label: z.string().trim().min(3).max(300),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  precision: z.enum(["housenumber", "street", "locality", "municipality"]),
});
export type PlaceInput = z.infer<typeof placeSchema>;

const minutes = z.number().int();

/** Prisma cuid sent back by the page: checked so only a plain id reaches a query. */
export const personIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/, "Personne introuvable.");

const dayMinute = (label: string) => minutes.min(0, `${label} invalide.`).max(24 * 60, `${label} invalide.`);

export const agendaSettingsSchema = z
  .object({
    home: placeSchema.nullable(),
    office: placeSchema.nullable(),
    workDays: z.array(z.number().int().min(1).max(7)).min(1, "Cochez au moins un jour travaillé.").max(7),
    dayStartMinutes: dayMinute("Heure de début"),
    dayEndMinutes: dayMinute("Heure de fin"),
    /** Strict limit, drive home included. Null = same as the wished end. */
    dayEndLimitMinutes: dayMinute("Heure limite").nullable(),
    defaultVisitMinutes: minutes.min(15, "Une visite dure au moins 15 minutes.").max(8 * 60),
  })
  .refine((p) => p.dayEndMinutes - p.dayStartMinutes >= 60, {
    message: "La fin de journée doit être au moins une heure après le début.",
    path: ["dayEndMinutes"],
  })
  .refine((p) => p.dayEndLimitMinutes === null || p.dayEndLimitMinutes >= p.dayEndMinutes, {
    message: "L'heure limite ne peut pas être avant la fin de journée souhaitée.",
    path: ["dayEndLimitMinutes"],
  });
export type AgendaSettingsInput = z.infer<typeof agendaSettingsSchema>;

/** Digits and the usual separators only (« 06 12 34 56 78 », « +33 6… »). Empty = no phone. */
export const phoneSchema = z
  .string()
  .trim()
  .max(30, "Numéro de téléphone trop long.")
  .regex(/^[0-9+().\s-]*$/, "Le numéro de téléphone ne peut contenir que des chiffres.")
  .nullable()
  .default(null)
  .transform((v) => (v ? v : null));

/** A coloured group (Thomas, 2026-11-02): a short name and a colour of the fixed palette. */
export const agendaGroupSchema = z.object({
  name: z.string().trim().min(1, "Indiquez le nom du groupe.").max(40, "40 caractères au plus.").transform((s) => s.replace(/\s+/g, " ")),
  color: z.enum(GROUP_COLORS),
});
export type AgendaGroupInput = z.infer<typeof agendaGroupSchema>;

export const groupIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/, "Groupe introuvable.");

export const agendaPersonSchema = z
  .object({
    fullName: z.string().trim().min(2, "Indiquez le nom de la personne.").max(200),
    /** Null = the first group. */
    groupId: groupIdSchema.nullable().default(null),
    address: placeSchema.nullable(),
    /** Both null = « Pas de visite régulière ». */
    visitsPerPeriod: z.number().int().min(1).max(10).nullable(),
    visitPeriod: z.enum(["WEEK", "MONTH", "QUARTER", "YEAR"]).nullable(),
    /** « Tous les N » périodes. */
    visitEvery: z.number().int().min(1, "Indiquez un nombre d'au moins 1.").max(52, "52 au plus.").default(1),
    /** Last visit before the agenda knew about the person (« Dernière visite le »); null = unknown. */
    lastVisitOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de dernière visite invalide.")
      .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Date de dernière visite invalide.")
      .nullable()
      .default(null),
    /** Null = decided from the address (src/lib/agenda/ehpad.ts). */
    inEhpad: z.boolean().nullable().default(null),
    visitMinutes: minutes.min(15).max(8 * 60).nullable(),
    notes: z.string().trim().max(1000).nullable(),
    phone: phoneSchema,
    status: z.enum(["ACTIVE", "PAUSED", "ENDED"]),
    endReason: z.enum(["DECES", "DESSAISISSEMENT", "MAINLEVEE", "TRANSFERT", "AUTRE"]).nullable(),
  })
  .refine((p) => (p.visitsPerPeriod === null) === (p.visitPeriod === null), {
    message: "Fréquence des visites incomplète.",
    path: ["visitPeriod"],
  })
  .refine((p) => p.lastVisitOn === null || p.lastVisitOn <= new Date().toISOString().slice(0, 10), {
    message: "La dernière visite ne peut pas être dans le futur.",
    path: ["lastVisitOn"],
  })
  .refine((p) => p.status !== "ENDED" || p.endReason !== null, {
    message: "Indiquez la raison de la fin de mesure.",
    path: ["endReason"],
  });
export type AgendaPersonInput = z.infer<typeof agendaPersonSchema>;

/** Optional free text: trimmed, empty = null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères au plus.`)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null));

/** One opening slot: days of the week and hours (minutes after midnight). */
export const partnerHoursSchema = z
  .object({
    dows: z.array(z.number().int().min(1).max(7)).min(1, "Cochez au moins un jour pour chaque plage horaire.").max(7),
    fromMin: dayMinute("Heure d'ouverture"),
    toMin: dayMinute("Heure de fermeture"),
  })
  .refine((h) => h.toMin > h.fromMin, { message: "Une plage horaire doit finir après son début.", path: ["toMin"] });

/** A partner of the shared address book (Thomas, 2026-11-02): a name or a structure, at least. */
export const agendaPartnerSchema = z
  .object({
    /** Null = the first group of partners. */
    groupId: groupIdSchema.nullable().default(null),
    civility: optionalText(20, "Civilité"),
    lastName: optionalText(100, "Nom"),
    firstName: optionalText(100, "Prénom"),
    company: optionalText(150, "Structure"),
    role: optionalText(100, "Fonction"),
    phone: phoneSchema,
    mobile: phoneSchema,
    email: optionalText(200, "E-mail").refine((v) => v === null || z.string().email().safeParse(v).success, "Adresse e-mail invalide."),
    address: placeSchema.nullable().default(null),
    notes: optionalText(1000, "Notes"),
    /** Opening hours (« lun.–ven. 9 h–12 h »): appointments with this contact are placed inside them. */
    hours: z.array(partnerHoursSchema).max(7, "7 plages horaires au plus.").default([]),
    /** Persons of the current agenda this contact works for (« notaire de Jean Bonneau »). */
    linkedPersonIds: z.array(personIdSchema).max(200).default([]),
  })
  .refine((p) => p.lastName !== null || p.company !== null, {
    message: "Indiquez un nom ou une structure.",
    path: ["lastName"],
  });
export type AgendaPartnerInput = z.infer<typeof agendaPartnerSchema>;

export const partnerIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/, "Contact introuvable.");
