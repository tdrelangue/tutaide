"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_FILE_CONTACTS } from "@/lib/agenda/contacts-file";
import { findImportConflicts, importContactsFromFile, type ImportConflict, type ImportReport } from "@/lib/agenda/contacts-import";
import { requireAgendaOwner } from "@/lib/agenda/context";
import { dayRuleSchema, deleteDayRule, ruleIdSchema, saveDayRule } from "@/lib/agenda/day-rules";
import { searchPlaces, type GeocodeResult } from "@/lib/agenda/geocode";
import { createGroup, deleteGroup, moveGroup, setPersonsGroup, updateGroup, type GroupScope } from "@/lib/agenda/groups";
import { addressBookOf, createPartner, deletePartner, updatePartner } from "@/lib/agenda/partners";
import { importPartnersFromFile, partnerImportSchema, type PartnerImportReport } from "@/lib/agenda/partners-import";
import {
  createAgendaPerson,
  deleteAgendaPerson,
  deleteAgendaPersons,
  endAgendaPersons,
  importPersonsFromDossiers,
  saveAgendaSettings as storeAgendaSettings,
  updateAgendaPerson,
} from "@/lib/agenda/service";
import {
  agendaGroupSchema,
  agendaPartnerSchema,
  agendaPersonSchema,
  agendaSettingsSchema,
  groupIdSchema,
  partnerIdSchema,
  personIdSchema,
  phoneSchema,
} from "@/lib/agenda/validation";
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
    return await searchPlaces(z.string().max(200, "Adresse trop longue.").parse(query));
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
    return done(`${plural(count, "personne rendue inactive", "personnes rendues inactives")}`);
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

// ---------------------------------------------------------------------------
// Groups (Thomas, 2026-11-02)
// ---------------------------------------------------------------------------

const groupKindSchema = z.enum(["PERSONS", "PARTNERS"]);

/** Persons' groups are the MJPM's; partners' groups belong to the shared address book. */
async function groupScope(kind: unknown): Promise<GroupScope> {
  const { ownerId } = await requireAgendaOwner();
  if (groupKindSchema.parse(kind) === "PERSONS") return { kind: "PERSONS", ownerId };
  return { kind: "PARTNERS", book: await addressBookOf(ownerId) };
}

export async function saveAgendaGroup(groupId: string | null, input: unknown, kind: unknown = "PERSONS"): Promise<AgendaActionResult> {
  try {
    const scope = await groupScope(kind);
    const data = agendaGroupSchema.parse(input);
    const id = groupIdSchema.nullable().parse(groupId);
    if (id === null) {
      await createGroup(scope, data);
      return done(`Groupe « ${data.name} » créé`);
    }
    if (!(await updateGroup(scope, id, data))) return { success: false, error: "Groupe introuvable." };
    return done("Groupe modifié");
  } catch (error) {
    return failure("saveGroup", error);
  }
}

const directionSchema = z.enum(["up", "down"]);

export async function moveAgendaGroupAction(groupId: string, direction: unknown, kind: unknown = "PERSONS"): Promise<AgendaActionResult> {
  try {
    const scope = await groupScope(kind);
    if (!(await moveGroup(scope, groupIdSchema.parse(groupId), directionSchema.parse(direction)))) {
      return { success: false, error: "Groupe introuvable." };
    }
    return done("Ordre des groupes modifié");
  } catch (error) {
    return failure("moveGroup", error);
  }
}

export async function removeAgendaGroup(groupId: string, kind: unknown = "PERSONS"): Promise<AgendaActionResult> {
  try {
    const scope = await groupScope(kind);
    const result = await deleteGroup(scope, groupIdSchema.parse(groupId));
    if (result === null) return { success: false, error: "Groupe introuvable." };
    if (result.moved === 0) return done("Groupe supprimé");
    const moved = scope.kind === "PERSONS" ? plural(result.moved, "personne passée", "personnes passées") : plural(result.moved, "contact passé", "contacts passés");
    return done(`Groupe supprimé : ${moved} dans « ${result.into} »`);
  } catch (error) {
    return failure("removeGroup", error);
  }
}

/** Selection mode: puts the selected persons in one group. */
export async function moveAgendaPersonsToGroup(personIds: unknown, groupId: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    const count = await setPersonsGroup(ownerId, personIdsSchema.parse(personIds), groupIdSchema.parse(groupId));
    return done(`${plural(count, "personne déplacée", "personnes déplacées")}`);
  } catch (error) {
    return failure("movePersonsToGroup", error);
  }
}

// ---------------------------------------------------------------------------
// Contacts: the partners' address book, shared by the structure (Thomas, 2026-11-02)
// ---------------------------------------------------------------------------

export async function saveAgendaPartner(partnerId: string | null, input: unknown): Promise<AgendaActionResult> {
  try {
    const { ownerId, actorId } = await requireAgendaOwner();
    const book = await addressBookOf(ownerId);
    const data = agendaPartnerSchema.parse(input);
    const id = partnerIdSchema.nullable().parse(partnerId);
    if (id === null) {
      await createPartner(book, ownerId, actorId, data);
      return done("Contact ajouté");
    }
    if (!(await updatePartner(book, ownerId, id, data))) return { success: false, error: "Contact introuvable." };
    return done("Modifications enregistrées");
  } catch (error) {
    return failure("savePartner", error);
  }
}

export async function removeAgendaPartner(partnerId: string): Promise<AgendaActionResult> {
  try {
    const { ownerId } = await requireAgendaOwner();
    if (!(await deletePartner(await addressBookOf(ownerId), partnerIdSchema.parse(partnerId)))) {
      return { success: false, error: "Contact introuvable." };
    }
    return done("Contact supprimé");
  } catch (error) {
    return failure("removePartner", error);
  }
}

export type PartnerFileImportResult = { success: true; report: PartnerImportReport } | { success: false; error: string };

/** Contacts read from a file by the page and checked by the user (partners-file.ts), into the shared address book. */
export async function importAgendaPartnersFromFile(input: unknown): Promise<PartnerFileImportResult> {
  try {
    const { ownerId, actorId } = await requireAgendaOwner();
    const report = await importPartnersFromFile(await addressBookOf(ownerId), actorId, partnerImportSchema.parse(input));
    revalidatePath("/agenda");
    return { success: true, report };
  } catch (error) {
    return { success: false, error: failureMessage("importPartners", error) };
  }
}
