"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { requireOrgAdmin } from "@/lib/access/context";
import { findUndoableEntry, markEntryUndone, recordOrgAudit, type AuditEntry } from "@/lib/organizations/audit";
import {
  createOrgMember,
  moveAssistantMandataires,
  setMandataireAssistants,
  setOrgMemberArchived,
  transferMandataireDossiers,
  undoBulkChange,
  updateOrgMember,
  type MemberUpdate,
  type NewMember,
} from "@/lib/organizations/members";
import {
  getOrgOverview,
  removeOrgSmtp,
  saveOrgDestination,
  saveOrgSmtp,
  saveSharedFolderHint,
  type OrgOverview,
} from "@/lib/organizations/overview";
import { ROLE_LABELS, toRoleChoice } from "./labels";
import type { SmtpConfigFormData } from "@/lib/validations";

/**
 * /structure — the organisation admin panel. Every action is confined to the
 * admin's own organisation (requireOrgAdmin), never touches dossier content,
 * and is written to the organisation's journal.
 */

export type ActionResult = { success: true; message?: string } | { success: false; error: string };

type Outcome = { result: ActionResult; audit?: AuditEntry };

function failure(error: unknown): ActionResult {
  if (error instanceof ZodError) return { success: false, error: error.issues[0]?.message ?? "Données invalides" };
  console.error("[structure]", error);
  // Database errors are logged, never shown (they can carry internal details).
  const isDbError = error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError;
  if (isDbError || !(error instanceof Error)) return { success: false, error: "Erreur inattendue" };
  return { success: false, error: error.message };
}

async function run(task: (orgId: string, actorId: string) => Promise<Outcome>): Promise<ActionResult> {
  try {
    const { orgId, actorId } = await requireOrgAdmin();
    const { result, audit } = await task(orgId, actorId);
    if (result.success && audit) await recordOrgAudit(orgId, actorId, audit);
    revalidatePath("/structure");
    return result;
  } catch (error) {
    return failure(error);
  }
}

/** Keeps a successful result's message and attaches the journal entry. */
function logged(result: ActionResult, audit: AuditEntry, message?: string): Outcome {
  if (!result.success) return { result };
  return { result: message ? { success: true, message } : result, audit };
}

export async function getStructure(): Promise<OrgOverview | null> {
  const { orgId } = await requireOrgAdmin();
  return getOrgOverview(orgId);
}

export async function addMember(input: NewMember): Promise<ActionResult> {
  return run(async (orgId) => {
    const created = await createOrgMember(orgId, input);
    const role = ROLE_LABELS[toRoleChoice(input.orgRole)];
    return logged(created, { action: "Compte créé", targetId: created.id, details: `${role}${input.isOrgAdmin ? " + administrateur" : ""}` }, "Compte créé");
  });
}

function describeUpdate(input: MemberUpdate): string {
  const parts: string[] = [];
  if (input.orgRole !== undefined) parts.push(`rôle : ${ROLE_LABELS[toRoleChoice(input.orgRole)]}`);
  if (input.isOrgAdmin !== undefined) parts.push(input.isOrgAdmin ? "administrateur : oui" : "administrateur : non");
  if (input.password) parts.push("mot de passe réinitialisé");
  if (input.name !== undefined) parts.push("nom");
  return parts.join(", ");
}

export async function editMember(memberId: string, input: MemberUpdate): Promise<ActionResult> {
  return run(async (orgId, actorId) =>
    logged(await updateOrgMember(orgId, memberId, input, actorId), { action: "Compte modifié", targetId: memberId, details: describeUpdate(input) })
  );
}

export async function archiveMember(memberId: string, archived: boolean): Promise<ActionResult> {
  return run(async (orgId, actorId) =>
    logged(await setOrgMemberArchived(orgId, memberId, archived, actorId), { action: archived ? "Compte archivé" : "Compte réactivé", targetId: memberId })
  );
}

export async function assignAssistants(mandataireId: string, assistantIds: string[]): Promise<ActionResult> {
  return run(async (orgId, actorId) =>
    logged(await setMandataireAssistants(orgId, mandataireId, assistantIds, actorId), {
      action: "Répartition modifiée",
      targetId: mandataireId,
      details: `${assistantIds.length} assistant(e)(s) affecté(e)(s)`,
    })
  );
}

export async function moveAssistantWork(fromId: string, toId: string): Promise<ActionResult> {
  return run(async (orgId, actorId) => {
    const result = await moveAssistantMandataires(orgId, fromId, toId, actorId);
    const moved = result.success ? result.moved ?? 0 : 0;
    const audit = { action: "Mandataires réattribués", targetId: fromId, details: `${moved} mandataire(s) vers un(e) autre assistant(e)`, undo: result.success ? result.undo : undefined };
    return logged(result, audit, `${moved} mandataire(s) réattribué(s) — annulable depuis le Journal`);
  });
}

export async function transferDossiers(fromId: string, toId: string): Promise<ActionResult> {
  return run(async (orgId, actorId) => {
    const result = await transferMandataireDossiers(orgId, fromId, toId, actorId);
    const moved = result.success ? result.moved ?? 0 : 0;
    const audit = { action: "Dossiers transférés", targetId: fromId, details: `${moved} dossier(s) vers un autre mandataire`, undo: result.success ? result.undo : undefined };
    return logged(result, audit, `${moved} dossier(s) transféré(s) — annulable depuis le Journal`);
  });
}

/** Reverses one bulk change recorded in the journal, exactly. */
export async function undoJournalEntry(eventId: string): Promise<ActionResult> {
  return run(async (orgId, actorId) => {
    const entry = await findUndoableEntry(orgId, eventId);
    if (!entry) return { result: { success: false, error: "Cette modification ne peut plus être annulée" } };
    const result = await undoBulkChange(orgId, entry.undo, actorId);
    if (!result.success) return { result };
    await markEntryUndone(eventId);
    const restored = result.restored ?? 0;
    return logged(result, { action: `Annulation : ${entry.action}`, targetId: entry.undo.from, details: `${restored} élément(s) rétabli(s)` }, `Annulé : ${restored} élément(s) rétabli(s)`);
  });
}

export async function saveStructureSmtp(data: SmtpConfigFormData): Promise<ActionResult> {
  return run(async (orgId) => {
    await saveOrgSmtp(orgId, data);
    return logged({ success: true }, { action: "Messagerie de la structure modifiée", details: `${data.fromEmail} via ${data.smtpHost}` }, "Messagerie de la structure enregistrée");
  });
}

export async function removeStructureSmtp(): Promise<ActionResult> {
  return run(async (orgId) => {
    await removeOrgSmtp(orgId);
    return logged({ success: true }, { action: "Messagerie de la structure retirée" }, "Chaque membre utilise de nouveau sa propre messagerie");
  });
}

export async function saveStructureDestination(
  moduleType: "APA" | "ASH" | "PCH",
  destinationEmail: string,
  imapFolder: string
): Promise<ActionResult> {
  return run(async (orgId) => {
    await saveOrgDestination(orgId, { moduleType, destinationEmail, imapFolder });
    const details = destinationEmail ? `${moduleType} → ${destinationEmail}` : `${moduleType} : retirée`;
    return logged({ success: true }, { action: "Destinataire de module modifié", details }, `Destination ${moduleType} enregistrée`);
  });
}

export async function saveStructureFolderHint(hint: string): Promise<ActionResult> {
  return run(async (orgId) => {
    await saveSharedFolderHint(orgId, hint);
    return logged({ success: true }, { action: "Dossier partagé modifié", details: hint.trim() || "retiré" }, "Dossier partagé enregistré");
  });
}
