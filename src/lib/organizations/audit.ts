import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import type { UndoData } from "./members";

/**
 * Journal of the organisation admin panel: who changed what, for whom. Shown
 * to the organisation's admins in /structure → Journal. Never holds dossier
 * or protected-person data — only people of the organisation and counts.
 */

export type AuditEntry = {
  action: string;
  targetId?: string | null;
  details?: string | null;
  /** Set for bulk changes that can be undone from the journal. */
  undo?: UndoData;
};

/** Records a change; never blocks the change itself if the journal write fails. */
export async function recordOrgAudit(orgId: string, actorId: string, entry: AuditEntry): Promise<void> {
  try {
    // When OrigAI acts while logged in as the admin, both are recorded.
    const sessionUserId = await getCurrentUserId();
    await db.orgAuditEvent.create({
      data: {
        orgId,
        actorId,
        realActorId: sessionUserId && sessionUserId !== actorId ? sessionUserId : null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        details: entry.details ?? null,
        undoData: entry.undo ? JSON.stringify(entry.undo) : null,
      },
    });
  } catch (error) {
    console.error("[org-audit] could not record", entry.action, error);
  }
}

export type AuditRow = {
  id: string;
  createdAt: Date;
  actorName: string;
  byOrigAI: boolean;
  action: string;
  targetName: string | null;
  details: string | null;
  canUndo: boolean;
  undoneAt: Date | null;
};

export async function listOrgAudit(orgId: string, limit = 200): Promise<AuditRow[]> {
  const events = await db.orgAuditEvent.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const ids = [...new Set(events.flatMap((e) => [e.actorId, e.targetId]).filter((id): id is string => Boolean(id)))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name || u.email]));
  return events.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    actorName: (e.actorId && nameOf.get(e.actorId)) || "Compte supprimé",
    byOrigAI: e.realActorId !== null,
    action: e.action,
    targetName: e.targetId ? nameOf.get(e.targetId) ?? null : null,
    details: e.details,
    canUndo: e.undoData !== null && e.undoneAt === null,
    undoneAt: e.undoneAt,
  }));
}

function isUndoData(value: unknown): value is UndoData {
  if (typeof value !== "object" || value === null) return false;
  const kind: unknown = Reflect.get(value, "kind");
  return kind === "move-assistant" || kind === "transfer-dossiers";
}

/** The undo record of one journal entry of this organisation, if still undoable. */
export async function findUndoableEntry(orgId: string, eventId: string): Promise<{ action: string; undo: UndoData } | null> {
  const event = await db.orgAuditEvent.findFirst({
    where: { id: eventId, orgId, undoneAt: null, undoData: { not: null } },
    select: { action: true, undoData: true },
  });
  if (!event?.undoData) return null;
  const parsed: unknown = JSON.parse(event.undoData);
  return isUndoData(parsed) ? { action: event.action, undo: parsed } : null;
}

export async function markEntryUndone(eventId: string): Promise<void> {
  await db.orgAuditEvent.update({ where: { id: eventId }, data: { undoneAt: new Date() } });
}
