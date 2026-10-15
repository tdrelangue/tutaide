import { z } from "zod";

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

export const agendaPersonSchema = z
  .object({
    fullName: z.string().trim().min(2, "Indiquez le nom de la personne.").max(200),
    address: placeSchema.nullable(),
    visitsPerPeriod: z.number().int().min(1).max(10),
    visitPeriod: z.enum(["WEEK", "MONTH", "QUARTER", "YEAR"]),
    visitMinutes: minutes.min(15).max(8 * 60).nullable(),
    notes: z.string().trim().max(1000).nullable(),
    status: z.enum(["ACTIVE", "PAUSED", "ENDED"]),
    endReason: z.enum(["DECES", "DESSAISISSEMENT", "MAINLEVEE", "TRANSFERT", "AUTRE"]).nullable(),
  })
  .refine((p) => p.status !== "ENDED" || p.endReason !== null, {
    message: "Indiquez la raison de la fin de mesure.",
    path: ["endReason"],
  });
export type AgendaPersonInput = z.infer<typeof agendaPersonSchema>;
