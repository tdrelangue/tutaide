"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_FILE_CONTACTS } from "@/lib/agenda/contacts-file";
import { findImportConflicts, importContactsFromFile, type ImportConflict, type ImportReport } from "@/lib/agenda/contacts-import";
import { requireAgendaOwner } from "@/lib/agenda/context";
import { dayRuleSchema, deleteDayRule, ruleIdSchema, saveDayRule } from "@/lib/agenda/day-rules";
import { searchAddress, type GeocodeResult } from "@/lib/agenda/geocode";
import {
  createAgendaPerson,
  deleteAgendaPerson,
  deleteAgendaPersons,
  endAgendaPersons,
  importPersonsFromDossiers,
  saveAgendaSettings as storeAgendaSettings,
  updateAgendaPerson,
} from "@/lib/agenda/service";
import { agendaPersonSchema, agendaSettingsSchema, personIdSchema, phoneSchema } from "@/lib/agenda/validation";
import { failureMessage } from "./action-errors";

/**
 * /agenda — the « Agenda » add-on. Every action works on the agenda of the
 * MJPM resolved on the server (requireAgendaOwner), never on an id sent by
 * the page. Errors never echo protected-person data.
 */

export type AgendaActionResult = { success: true; message?: string } | { success: false; error: string };

function failure(action: string, error: unknown): AgendaActionResult {
  return { success: false, error: failureMessage(action, error) };
}

function done(message: string): AgendaActionResult {
  revalidatePath("/agenda");
  return { success: true, message };
}

export async function searchAgendaAddress(query: string): Promise<GeocodeResult> {
  try {
    await requireAgendaOwner();
    return await searchAddress(z.string().max(200, "Adresse trop longue.").parse(query));
  } catch (error) {
    const result = failure("searchAddress", error);
    return { ok: false, error: result.success ? "" : result.error };
  }
}

export async function saveAgendaSettings(input: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    await storeAgendaSettings(ownerId, agendaSettingsSchema.parse(input));
    revalidatePath("/settings");
    return done("Paramètres de l'agenda enregistrés");
  } catch (error) {
    return failure("saveSettings", error);
  }
}

export async function importAgendaPersons(): Promise<AgendaActionResult> {
  try {
    const { ownerId, actorId } = await requireAgendaOwner();
    const count = await importPersonsFromDossiers(ownerId, actorId);
    if (count === 0) return done("Toutes les personnes de vos dossiers sont déjà dans l'agenda");
    return done(`${count} personne${count > 1 ? "s ajoutées" : " ajoutée"} depuis vos dossiers`);
  } catch (error) {
    return failure("importPersons", error);
  }
}

const fileContactsSchema = z
  .array(
    z.object({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      usageName: z.string().trim().min(1).max(100).nullable(),
      address: z.string().trim().min(3).max(200).nullable(),
      phone: phoneSchema,
    }),
  )
  .min(1, "Aucune personne trouvée dans ce fichier.")
  .max(MAX_FILE_CONTACTS, `Le fichier contient plus de ${MAX_FILE_CONTACTS} personnes.`);

export type FileImportResult = { success: true; report: ImportReport } | { success: false; error: string };

const replaceSchema = z.array(z.number().int().min(0).max(MAX_FILE_CONTACTS)).max(MAX_FILE_CONTACTS);

export type FileConflictsResult = { success: true; conflicts: ImportConflict[] } | { success: false; error: string };

/** Before importing: persons already in the agenda whose address or phone differs from the file. */
export async function findAgendaFileConflicts(input: unknown): Promise<FileConflictsResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    return { success: true, conflicts: await findImportConflicts(ownerId, fileContactsSchema.parse(input)) };
  } catch (error) {
    return { success: false, error: failureMessage("importFile", error) };
  }
}

/** Persons read from a file by the page (name, address, phone only: contacts-file.ts); `replace` = lines whose differences win. */
export async function importAgendaPersonsFromFile(input: unknown, replace: unknown = []): Promise<FileImportResult> {
  try {
    const { ownerId, actorId } = await requireAgendaOwner();
    const choice = new Set(replaceSchema.parse(replace));
    const report = await importContactsFromFile(ownerId, actorId, fileContactsSchema.parse(input), choice);
    revalidatePath("/agenda");
    return { success: true, report };
  } catch (error) {
    return { success: false, error: failureMessage("importFile", error) };
  }
}

export async function saveAgendaPerson(personId: string | null, input: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId, actorId } = await requireAgendaOwner();
    const data = agendaPersonSchema.parse(input);
    const id = personIdSchema.nullable().parse(personId);
    if (id === null) {
      await createAgendaPerson(ownerId, actorId, data);
      return done("Personne ajoutée");
    }
    if (!(await updateAgendaPerson(ownerId, id, data))) return { success: false, error: "Personne introuvable." };
    return done("Modifications enregistrées");
  } catch (error) {
    return failure("savePerson", error);
  }
}

export async function removeAgendaPerson(personId: string): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    if (!(await deleteAgendaPerson(ownerId, personIdSchema.parse(personId)))) {
      return { success: false, error: "Personne introuvable." };
    }
    return done("Personne retirée de l'agenda");
  } catch (error) {
    return failure("removePerson", error);
  }
}

const personIdsSchema = z.array(personIdSchema).min(1, "Aucune personne sélectionnée.").max(MAX_FILE_CONTACTS);
const endReasonSchema = z.enum(["DECES", "DESSAISISSEMENT", "MAINLEVEE", "TRANSFERT", "AUTRE"]);

const plural = (n: number, one: string, many: string) => (n > 1 ? `${n} ${many}` : `${n} ${one}`);

/** Selection mode: removes the selected persons; those whose address hosts an appointment are kept and named. */
export async function removeAgendaPersons(personIds: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    const { deleted, refused } = await deleteAgendaPersons(ownerId, personIdsSchema.parse(personIds));
    revalidatePath("/agenda");
    const removed = `${plural(deleted, "personne retirée", "personnes retirées")} de l'agenda`;
    if (refused.length === 0) return { success: true, message: removed };
    return {
      success: false,
      error: `${removed}. Non retirées, car leur adresse est le lieu d'un rendez-vous : ${refused.join(", ")}.`,
    };
  } catch (error) {
    return failure("removePersons", error);
  }
}

/** Selection mode: « Mesure terminée » for the selected persons, with one reason. */
export async function endAgendaMeasures(personIds: unknown, endReason: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    const count = await endAgendaPersons(ownerId, personIdsSchema.parse(personIds), endReasonSchema.parse(endReason));
    return done(`${plural(count, "mesure terminée", "mesures terminées")}`);
  } catch (error) {
    return failure("endMeasures", error);
  }
}

/** « Mes indisponibilités » and holidays change the proposals: the planning reads them again. */
function rulesDone(message: string): AgendaActionResult {
  revalidatePath("/settings");
  return done(message);
}

export async function saveAgendaDayRule(ruleId: string | null, input: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    const id = ruleIdSchema.nullable().parse(ruleId);
    if (!(await saveDayRule(ownerId, id, dayRuleSchema.parse(input)))) return { success: false, error: "Créneau introuvable." };
    return rulesDone(id === null ? "Créneau ajouté" : "Créneau modifié");
  } catch (error) {
    return failure("saveDayRule", error);
  }
}

export async function removeAgendaDayRule(ruleId: string): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    if (!(await deleteDayRule(ownerId, ruleIdSchema.parse(ruleId)))) return { success: false, error: "Créneau introuvable." };
    return rulesDone("Créneau supprimé");
  } catch (error) {
    return failure("removeDayRule", error);
  }
}
