import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { seedGlobalTemplates } from "@/lib/default-templates";
import {
  refuseAssignment,
  refuseMemberChange,
  refuseProtectedAccount,
  refuseSelfGrant,
  type MemberState,
  type OrgRoleValue,
} from "./rules";

/**
 * Organisation membership service: every write for /structure (organisation
 * admin) and /admin/organisations (super-admin). Callers authorise first and
 * pass the organisation id; everything here is confined to that organisation.
 */

export type Result = { success: true } | { success: false; error: string };

const roleSchema = z.enum(["MANDATAIRE", "ASSISTANT"]).nullable();

export const newMemberSchema = z.object({
  email: z.string().trim().email("Email invalide"),
  name: z.string().trim().min(1, "Nom requis").max(120),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  orgRole: roleSchema,
  isOrgAdmin: z.boolean(),
});
export type NewMember = z.infer<typeof newMemberSchema>;

export const memberUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  orgRole: roleSchema.optional(),
  isOrgAdmin: z.boolean().optional(),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum").optional(),
});
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

async function loadMembers(orgId: string) {
  const users = await db.user.findMany({
    where: { orgId },
    select: { id: true, role: true, orgRole: true, isOrgAdmin: true, archivedAt: true },
  });
  const states: MemberState[] = users.map((u) => ({
    id: u.id,
    orgRole: u.orgRole,
    isOrgAdmin: u.isOrgAdmin,
    archived: u.archivedAt !== null,
  }));
  return { states, platformRoleOf: new Map(users.map((u) => [u.id, u.role])) };
}

async function memberStates(orgId: string): Promise<MemberState[]> {
  return (await loadMembers(orgId)).states;
}

/** Common refusals for a write on one member: unknown, protected, or self-grant. */
async function refuseWriteOn(
  orgId: string,
  memberId: string,
  actorId: string,
  roleChange?: OrgRoleValue | null
): Promise<{ states: MemberState[]; refusal: string | null }> {
  const { states, platformRoleOf } = await loadMembers(orgId);
  const role = platformRoleOf.get(memberId);
  if (!role) return { states, refusal: "Membre introuvable" };
  const refusal =
    refuseProtectedAccount(role) ??
    (roleChange !== undefined ? refuseSelfGrant(actorId, memberId, { orgRole: roleChange }) : null);
  return { states, refusal };
}

function ownedDossierCount(userId: string): Promise<number> {
  return db.dossier.count({ where: { userId } });
}

export async function createOrgMember(orgId: string, input: NewMember): Promise<Result & { id?: string }> {
  const data = newMemberSchema.parse(input);
  const email = data.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) {
    return { success: false, error: "Cet email est déjà utilisé" };
  }
  const user = await db.user.create({
    data: {
      email,
      name: data.name,
      passwordHash: await hash(data.password, 12),
      orgId,
      orgRole: data.orgRole,
      isOrgAdmin: data.isOrgAdmin,
      // The organisation is billed as a whole, never each member.
      billingRequired: false,
    },
  });
  await seedGlobalTemplates();
  return { success: true, id: user.id };
}

export async function updateOrgMember(
  orgId: string,
  memberId: string,
  input: MemberUpdate,
  actorId: string
): Promise<Result> {
  const data = memberUpdateSchema.parse(input);
  const guard = await refuseWriteOn(orgId, memberId, actorId, data.orgRole);
  if (guard.refusal) return { success: false, error: guard.refusal };
  const refusal = refuseMemberChange(guard.states, memberId, data, await ownedDossierCount(memberId));
  if (refusal) return { success: false, error: refusal };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: memberId },
      data: {
        name: data.name,
        orgRole: data.orgRole,
        isOrgAdmin: data.isOrgAdmin,
        ...(data.password ? { passwordHash: await hash(data.password, 12) } : {}),
      },
    });
    // A role change ends the assignments that no longer make sense.
    if (data.orgRole !== undefined && data.orgRole !== "ASSISTANT") {
      await tx.assistantAssignment.deleteMany({ where: { assistantId: memberId } });
    }
    if (data.orgRole !== undefined && data.orgRole !== "MANDATAIRE") {
      await tx.assistantAssignment.deleteMany({ where: { mandataireId: memberId } });
    }
  });
  return { success: true };
}

/** Archive = can no longer log in; reversible. Assignments are kept for a return. */
export async function setOrgMemberArchived(
  orgId: string,
  memberId: string,
  archived: boolean,
  actorId: string
): Promise<Result> {
  if (archived && memberId === actorId) return { success: false, error: "Vous ne pouvez pas archiver votre propre compte" };
  const guard = await refuseWriteOn(orgId, memberId, actorId);
  if (guard.refusal) return { success: false, error: guard.refusal };
  const refusal = refuseMemberChange(guard.states, memberId, { archived }, archived ? await ownedDossierCount(memberId) : 0);
  if (refusal) return { success: false, error: refusal };
  await db.user.update({ where: { id: memberId }, data: { archivedAt: archived ? new Date() : null } });
  return { success: true };
}

/** Replaces the set of assistants handling one MJPM. */
export async function setMandataireAssistants(
  orgId: string,
  mandataireId: string,
  assistantIds: string[],
  actorId: string
): Promise<Result> {
  const members = await memberStates(orgId);
  const byId = new Map(members.map((m) => [m.id, m]));
  const already = await db.assistantAssignment.findMany({ where: { mandataireId }, select: { assistantId: true } });
  if (assistantIds.includes(actorId) && !already.some((a) => a.assistantId === actorId)) {
    return { success: false, error: refuseSelfGrant(actorId, actorId) ?? "Refusé" };
  }
  for (const assistantId of assistantIds) {
    const refusal = refuseAssignment(byId.get(assistantId), byId.get(mandataireId));
    if (refusal) return { success: false, error: refusal };
  }
  if (assistantIds.length === 0 && byId.get(mandataireId)?.orgRole !== "MANDATAIRE") {
    return { success: false, error: "Mandataire invalide" };
  }
  await db.$transaction([
    db.assistantAssignment.deleteMany({ where: { mandataireId, assistantId: { notIn: assistantIds } } }),
    ...assistantIds.map((assistantId) =>
      db.assistantAssignment.upsert({
        where: { assistantId_mandataireId: { assistantId, mandataireId } },
        create: { assistantId, mandataireId, createdById: actorId },
        update: {},
      })
    ),
  ]);
  return { success: true };
}

/**
 * An assistant leaves or changes job: every MJPM they handled goes to another
 * assistant (who keeps their own MJPMs too). Reversible by moving back.
 */
export async function moveAssistantMandataires(
  orgId: string,
  fromAssistantId: string,
  toAssistantId: string,
  actorId: string
): Promise<Result & { moved?: number }> {
  if (fromAssistantId === toAssistantId) return { success: false, error: "Choisissez un(e) autre assistant(e)" };
  const selfGrant = toAssistantId === actorId ? refuseSelfGrant(actorId, toAssistantId) : null;
  if (selfGrant) return { success: false, error: selfGrant };
  const members = await memberStates(orgId);
  const byId = new Map(members.map((m) => [m.id, m]));
  if (!byId.has(fromAssistantId)) return { success: false, error: "Assistant(e) invalide" };
  const current = await db.assistantAssignment.findMany({ where: { assistantId: fromAssistantId }, select: { mandataireId: true } });
  for (const { mandataireId } of current) {
    const refusal = refuseAssignment(byId.get(toAssistantId), byId.get(mandataireId));
    if (refusal) return { success: false, error: refusal };
  }
  await db.$transaction([
    ...current.map(({ mandataireId }) =>
      db.assistantAssignment.upsert({
        where: { assistantId_mandataireId: { assistantId: toAssistantId, mandataireId } },
        create: { assistantId: toAssistantId, mandataireId, createdById: actorId },
        update: {},
      })
    ),
    db.assistantAssignment.deleteMany({ where: { assistantId: fromAssistantId } }),
  ]);
  return { success: true, moved: current.length };
}

/**
 * An MJPM leaves: all their dossiers (and those dossiers' email history and
 * documents) now belong to another MJPM of the organisation. Files stay
 * where they are on disk; only the owner changes. Reversible by transferring back.
 */
export async function transferMandataireDossiers(
  orgId: string,
  fromMandataireId: string,
  toMandataireId: string,
  actorId: string
): Promise<Result & { moved?: number }> {
  if (fromMandataireId === toMandataireId) return { success: false, error: "Choisissez un autre mandataire" };
  const selfGrant = toMandataireId === actorId ? refuseSelfGrant(actorId, toMandataireId) : null;
  if (selfGrant) return { success: false, error: selfGrant };
  const members = await memberStates(orgId);
  const from = members.find((m) => m.id === fromMandataireId);
  const to = members.find((m) => m.id === toMandataireId);
  if (!from || from.orgRole !== "MANDATAIRE") return { success: false, error: "Mandataire d'origine invalide" };
  if (!to || to.orgRole !== "MANDATAIRE" || to.archived) return { success: false, error: "Mandataire de destination invalide" };

  const moved = await db.$transaction(async (tx) => {
    const dossierIds = (await tx.dossier.findMany({ where: { userId: fromMandataireId }, select: { id: true } })).map((d) => d.id);
    await tx.dossier.updateMany({ where: { id: { in: dossierIds } }, data: { userId: toMandataireId } });
    await tx.document.updateMany({ where: { dossierId: { in: dossierIds } }, data: { userId: toMandataireId } });
    await tx.emailSendEvent.updateMany({ where: { dossierId: { in: dossierIds } }, data: { userId: toMandataireId } });
    return dossierIds.length;
  });
  return { success: true, moved };
}

/** Is this user a member of this organisation? (Guards every write by id.) */
export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  return (await db.user.count({ where: { id: userId, orgId } })) > 0;
}

export type { OrgRoleValue };
