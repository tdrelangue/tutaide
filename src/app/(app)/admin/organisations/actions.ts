"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrgMember, newMemberSchema } from "@/lib/organizations/members";

/**
 * Super-administrator (OrigAI): organisations and their first admin. Day-to-day
 * membership is the organisation admin's job (/structure); the super-admin can
 * also do it by logging in as that admin ("se connecter au compte").
 */

export type OrgListItem = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: Date;
  memberCount: number;
  admins: string[];
};

export type AdminOrgResult = { success: true } | { success: false; error: string };

function failure(error: unknown): AdminOrgResult {
  if (error instanceof ZodError) return { success: false, error: error.issues[0]?.message ?? "Données invalides" };
  console.error("[admin/organisations]", error);
  return { success: false, error: "Erreur inattendue" };
}

export async function listOrganizations(): Promise<OrgListItem[]> {
  await requireAdmin();
  const orgs = await db.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      createdAt: true,
      members: { select: { name: true, email: true, isOrgAdmin: true, archivedAt: true } },
    },
  });
  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    archived: org.archivedAt !== null,
    createdAt: org.createdAt,
    memberCount: org.members.filter((m) => m.archivedAt === null).length,
    admins: org.members.filter((m) => m.isOrgAdmin && m.archivedAt === null).map((m) => m.name || m.email),
  }));
}

const orgNameSchema = z.string().trim().min(2, "Nom de la structure requis").max(120);

/** A new organisation always starts with its admin (so someone can run it). */
export async function createOrganization(input: { name: string; admin: z.infer<typeof newMemberSchema> }): Promise<AdminOrgResult> {
  try {
    await requireAdmin();
    const name = orgNameSchema.parse(input.name);
    const admin = newMemberSchema.parse({ ...input.admin, isOrgAdmin: true });
    if (await db.user.findUnique({ where: { email: admin.email.toLowerCase() } })) {
      return { success: false, error: "Cet email est déjà utilisé : rattachez plutôt ce compte existant" };
    }
    const org = await db.organization.create({ data: { name } });
    const created = await createOrgMember(org.id, admin);
    if (!created.success) {
      await db.organization.delete({ where: { id: org.id } });
      return created;
    }
    revalidatePath("/admin/organisations");
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameOrganization(orgId: string, name: string): Promise<AdminOrgResult> {
  try {
    await requireAdmin();
    await db.organization.update({ where: { id: orgId }, data: { name: orgNameSchema.parse(name) } });
    revalidatePath("/admin/organisations");
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

/** Archived organisation: members keep their accounts but lose all access. Reversible. */
export async function setOrganizationArchived(orgId: string, archived: boolean): Promise<AdminOrgResult> {
  try {
    await requireAdmin();
    await db.organization.update({ where: { id: orgId }, data: { archivedAt: archived ? new Date() : null } });
    revalidatePath("/admin/organisations");
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

const attachSchema = z.object({
  email: z.string().trim().email("Email invalide"),
  orgRole: z.enum(["MANDATAIRE", "ASSISTANT"]).nullable(),
  isOrgAdmin: z.boolean(),
});

/**
 * Brings an existing solo account (e.g. an MJPM already using Tutellia) into
 * an organisation, with their dossiers.
 */
export async function attachExistingUser(orgId: string, input: z.infer<typeof attachSchema>): Promise<AdminOrgResult> {
  try {
    await requireAdmin();
    const data = attachSchema.parse(input);
    const user = await db.user.findUnique({ where: { email: data.email.toLowerCase() }, select: { id: true, orgId: true, role: true } });
    if (!user) return { success: false, error: "Aucun compte avec cet email" };
    if (user.role === "ADMIN") return { success: false, error: "Un compte super-administrateur ne peut pas rejoindre une structure" };
    if (user.orgId) return { success: false, error: "Ce compte appartient déjà à une structure" };
    const ownsDossiers = (await db.dossier.count({ where: { userId: user.id } })) > 0;
    if (ownsDossiers && data.orgRole !== "MANDATAIRE") {
      return { success: false, error: "Ce compte a des dossiers : il doit être rattaché comme mandataire" };
    }
    await db.user.update({
      where: { id: user.id },
      data: { orgId, orgRole: data.orgRole, isOrgAdmin: data.isOrgAdmin },
    });
    revalidatePath("/admin/organisations");
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}
