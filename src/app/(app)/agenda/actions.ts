"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgendaOwner } from "@/lib/agenda/context";
import { searchAddress, type GeocodeResult } from "@/lib/agenda/geocode";
import {
  createAgendaPerson,
  deleteAgendaPerson,
  importPersonsFromDossiers,
  saveAgendaSettings as storeAgendaSettings,
  updateAgendaPerson,
} from "@/lib/agenda/service";
import { agendaPersonSchema, agendaSettingsSchema, personIdSchema } from "@/lib/agenda/validation";
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
