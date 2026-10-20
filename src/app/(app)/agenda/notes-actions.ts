"use server";

import { z } from "zod";
import { addTask, deleteTask, getNotes, saveNotes, setTaskDone, type NotesView } from "@/lib/agenda/notes";
import type { AgendaDataResult } from "@/lib/agenda/views/types";
import { flagSchema, itemKeySchema, run } from "./planning-support";

/**
 * Notes and checklist of a rendez-vous (lib/agenda/notes.ts). Every action
 * resolves the MJPM on the server and answers with the notes as they are now.
 */

const taskIdSchema = z.string({ invalid_type_error: "Tâche introuvable." }).regex(/^[a-z0-9]{20,40}$/, "Tâche introuvable.");
const textSchema = z.string({ invalid_type_error: "Texte invalide." });

export async function getEntryNotes(key: string): Promise<AgendaDataResult<NotesView>> {
  return run("getEntryNotes", async ({ ownerId }) => ({ success: true, data: await getNotes(ownerId, itemKeySchema.parse(key)) }));
}

export async function saveEntryNotes(key: string, text: string): Promise<AgendaDataResult<NotesView>> {
  return run("saveEntryNotes", async ({ ownerId }) => {
    const entry = itemKeySchema.parse(key);
    await saveNotes(ownerId, entry, textSchema.parse(text));
    return { success: true, data: await getNotes(ownerId, entry), message: "Notes enregistrées" };
  });
}

export async function addEntryTask(key: string, label: string): Promise<AgendaDataResult<NotesView>> {
  return run("addEntryTask", async ({ ownerId }) => {
    const entry = itemKeySchema.parse(key);
    await addTask(ownerId, entry, textSchema.parse(label));
    return { success: true, data: await getNotes(ownerId, entry) };
  });
}

export async function setEntryTaskDone(key: string, taskId: string, done: boolean): Promise<AgendaDataResult<NotesView>> {
  return run("setEntryTaskDone", async ({ ownerId }) => {
    await setTaskDone(ownerId, taskIdSchema.parse(taskId), flagSchema.parse(done));
    return { success: true, data: await getNotes(ownerId, itemKeySchema.parse(key)) };
  });
}

export async function removeEntryTask(key: string, taskId: string): Promise<AgendaDataResult<NotesView>> {
  return run("removeEntryTask", async ({ ownerId }) => {
    await deleteTask(ownerId, taskIdSchema.parse(taskId));
    return { success: true, data: await getNotes(ownerId, itemKeySchema.parse(key)) };
  });
}
