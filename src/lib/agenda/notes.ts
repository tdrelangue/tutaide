import { z } from "zod";
import { db } from "@/lib/db";
import { AgendaUserError } from "./bridge/errors";
import { seal, sealOrNull, unseal } from "./sealed";

/**
 * Notes and checklist of a rendez-vous. They belong to the appointment when
 * there is one (prepared before it is planned, shared by its occurrences), or
 * to the validated item for a visit. Text is stored encrypted.
 *
 * Screens refer to an entry by its item key (what the week sends back): a
 * validated item's key, the row id of a missed item, or an appointment id.
 */

export type NoteTarget = { readonly kind: "appointment" | "item"; readonly id: string };

export type TaskView = { readonly id: string; readonly label: string; readonly done: boolean };

export type NotesView = {
  readonly title: string;
  readonly notes: string;
  readonly tasks: readonly TaskView[];
};

export const MAX_NOTES = 5000;
export const MAX_TASK = 200;
const MAX_TASKS = 50;

export const notesSchema = z.string().max(MAX_NOTES, `Notes : ${MAX_NOTES} caractères au plus.`);
export const taskLabelSchema = z.string().trim().min(1, "Écrivez la tâche.").max(MAX_TASK, `Tâche : ${MAX_TASK} caractères au plus.`);

const NOT_AVAILABLE = "Les notes d'une visite proposée sont disponibles une fois la semaine validée.";

/** The appointment or item an entry of the screens stands for, or null (a proposed visit has no row yet). */
export async function resolveNoteTarget(ownerId: string, key: string): Promise<(NoteTarget & { title: string }) | null> {
  const item = await db.agendaItem.findFirst({
    where: { ownerId, OR: [{ itemKey: key }, { id: key }] },
    select: { id: true, title: true, appointmentId: true },
  });
  if (item?.appointmentId) return { kind: "appointment", id: item.appointmentId, title: item.title };
  if (item) return { kind: "item", id: item.id, title: item.title };
  const appointment = await db.agendaAppointment.findFirst({ where: { ownerId, id: key }, select: { id: true, title: true } });
  return appointment ? { kind: "appointment", id: appointment.id, title: appointment.title } : null;
}

async function requireTarget(ownerId: string, key: string): Promise<NoteTarget & { title: string }> {
  const target = await resolveNoteTarget(ownerId, key);
  if (!target) throw new AgendaUserError(NOT_AVAILABLE);
  return target;
}

function taskParent(target: NoteTarget) {
  return target.kind === "appointment" ? { appointmentId: target.id } : { itemId: target.id };
}

async function readNotes(ownerId: string, target: NoteTarget): Promise<string | null> {
  const row =
    target.kind === "appointment"
      ? await db.agendaAppointment.findUnique({ where: { id_ownerId: { id: target.id, ownerId } }, select: { notes: true } })
      : await db.agendaItem.findUnique({ where: { id_ownerId: { id: target.id, ownerId } }, select: { notes: true } });
  return row?.notes ?? null;
}

export async function getNotes(ownerId: string, key: string): Promise<NotesView> {
  const target = await requireTarget(ownerId, key);
  const [notes, tasks] = await Promise.all([
    readNotes(ownerId, target),
    db.agendaTask.findMany({ where: { ownerId, ...taskParent(target) }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  return {
    title: target.title,
    notes: unseal(notes) ?? "",
    tasks: tasks.map((t) => ({ id: t.id, label: unseal(t.label) ?? "", done: t.done })),
  };
}

export async function saveNotes(ownerId: string, key: string, text: string): Promise<void> {
  const target = await requireTarget(ownerId, key);
  const notes = sealOrNull(notesSchema.parse(text).trim());
  const where = { id_ownerId: { id: target.id, ownerId } };
  if (target.kind === "appointment") await db.agendaAppointment.update({ where, data: { notes } });
  else await db.agendaItem.update({ where, data: { notes } });
}

export async function addTask(ownerId: string, key: string, label: string): Promise<void> {
  const target = await requireTarget(ownerId, key);
  const parent = taskParent(target);
  const count = await db.agendaTask.count({ where: { ownerId, ...parent } });
  if (count >= MAX_TASKS) throw new AgendaUserError(`${MAX_TASKS} tâches au plus par rendez-vous.`);
  await db.agendaTask.create({ data: { ownerId, ...parent, label: seal(taskLabelSchema.parse(label)), position: count } });
}

const GONE = "Cette tâche n'existe plus. Rechargez la page.";

/** Writes are scoped to the owner in the same statement: never another MJPM's checklist. */
export async function setTaskDone(ownerId: string, taskId: string, done: boolean): Promise<void> {
  const { count } = await db.agendaTask.updateMany({ where: { id: taskId, ownerId }, data: { done, doneAt: done ? new Date() : null } });
  if (count === 0) throw new AgendaUserError(GONE);
}

export async function deleteTask(ownerId: string, taskId: string): Promise<void> {
  const { count } = await db.agendaTask.deleteMany({ where: { id: taskId, ownerId } });
  if (count === 0) throw new AgendaUserError(GONE);
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const NOTES_SEPARATOR = "\n\n";

/** Item notes first, then the appointment's (both kept, never one dropped for the other). */
function mergedNotes(itemNotes: string | null, appointmentNotes: string | null): string | null {
  const parts = [unseal(itemNotes), unseal(appointmentNotes)].filter((p): p is string => p !== null && p !== "");
  return parts.length === 0 ? null : seal(parts.join(NOTES_SEPARATOR));
}

/**
 * Before an appointment is deleted, what remains of it in the history (every
 * occurrence held or missed) keeps its notes, and the latest one its tasks,
 * so an audit export still finds them. Without such an item they go with it.
 */
export async function keepNotesOnHistory(tx: Tx, ownerId: string, appointmentId: string): Promise<void> {
  const appointment = await tx.agendaAppointment.findUnique({ where: { id_ownerId: { id: appointmentId, ownerId } }, select: { notes: true } });
  const kept = await tx.agendaItem.findMany({
    where: { ownerId, appointmentId, status: { not: "CANCELLED" } },
    orderBy: { date: "desc" },
    select: { id: true, notes: true },
  });
  const latest = kept[0];
  if (!latest) return;
  if (appointment?.notes) {
    for (const item of kept) {
      await tx.agendaItem.update({ where: { id_ownerId: { id: item.id, ownerId } }, data: { notes: mergedNotes(item.notes, appointment.notes) } });
    }
  }
  await tx.agendaTask.updateMany({ where: { ownerId, appointmentId }, data: { appointmentId: null, itemId: latest.id } });
}
