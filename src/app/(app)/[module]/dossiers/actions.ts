"use server";

import { documentFileExists, removeDocumentFile } from "@/lib/storage/document-files";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { readMandataireSelection, requireOwnerScope, type OwnerScope } from "@/lib/access/context";
import { dossierSchema, type DossierFormData } from "@/lib/validations";
import type {
  DossierPriority,
  DossierStatus,
  ModuleType,
  SendingFrequency,
  TemplateCategory,
} from "@prisma/client";

export type DossierWithDocuments = {
  id: string;
  fullName: string;
  moduleType: ModuleType;
  priority: DossierPriority;
  status: DossierStatus;
  notes: string | null;
  primaryEmail: string | null;
  ccEmails: string[];
  bccEmails: string[];
  createdAt: Date;
  updatedAt: Date;
  groupId: string | null;
  defaultTemplateId: string | null;
  sendingFrequency: SendingFrequency;
  defaultTemplate: { id: string; name: string } | null;
  /** The MJPM owning the dossier (shown to assistants handling several). */
  owner: { id: string; name: string };
  documents: {
    id: string;
    filename: string;
    mimeType: string;
    createdAt: Date;
  }[];
  _count: {
    documents: number;
  };
};

export type GroupMember = {
  id: string;
  moduleType: ModuleType;
  status: DossierStatus;
};

/** Other dossiers sharing this dossier's group (created together across modules), excluding itself. */
export async function getGroupMembers(dossierId: string): Promise<GroupMember[]> {
  const { ownerIds } = await requireOwnerScope();
  const dossier = await db.dossier.findFirst({
    where: { id: dossierId, userId: { in: ownerIds } },
    select: { groupId: true, userId: true },
  });
  if (!dossier?.groupId) return [];

  return db.dossier.findMany({
    where: { groupId: dossier.groupId, userId: dossier.userId, id: { not: dossierId } },
    select: { id: true, moduleType: true, status: true },
  });
}

const DOSSIER_INCLUDE = {
  documents: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, filename: true, mimeType: true, createdAt: true, blobUrl: true },
  },
  defaultTemplate: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
};

type LoadedDossier = Omit<DossierWithDocuments, "documents" | "_count" | "owner"> & {
  documents: (DossierWithDocuments["documents"][number] & { blobUrl: string })[];
  user: { id: string; name: string | null; email: string };
  userId: string;
};

/**
 * Hides documents whose file is not on this computer (uploaded elsewhere and
 * not synced yet) and exposes the owner without the full user row.
 */
function toDossierWithDocuments({ user, ...dossier }: LoadedDossier): DossierWithDocuments {
  const localDocs = dossier.documents.filter((doc) => documentFileExists(doc.blobUrl));
  return {
    ...dossier,
    owner: { id: user.id, name: user.name || user.email },
    documents: localDocs.map(({ blobUrl: _url, ...doc }) => doc),
    _count: { documents: localDocs.length },
  };
}

/**
 * A default template must be global, or belong to the user or one of the
 * MJPMs they work for (never a template id from another account).
 */
async function assertTemplateUsable(templateId: string | null | undefined, scope: OwnerScope): Promise<void> {
  if (!templateId) return;
  const usable = await db.emailTemplate.count({
    where: { id: templateId, OR: [{ isGlobal: true }, { userId: { in: [scope.actorId, ...scope.ownerIds] } }] },
  });
  if (usable === 0) throw new Error("Modele introuvable");
}

function revalidateModulePaths(): void {
  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");
  revalidatePath("/pch/dossiers");
}

export async function getDossiers(
  moduleType: ModuleType,
  params?: {
    search?: string;
    status?: DossierStatus;
    sortBy?: "updatedAt" | "fullName" | "priority";
    sortOrder?: "asc" | "desc";
  }
): Promise<DossierWithDocuments[]> {
  const { ownerIds } = await requireOwnerScope({ narrowed: true });

  const {
    search,
    status,
    sortBy = "updatedAt",
    sortOrder = "desc",
  } = params || {};

  const orderBy =
    sortBy === "priority"
      ? { priority: sortOrder as "asc" | "desc" }
      : sortBy === "fullName"
        ? { fullName: sortOrder as "asc" | "desc" }
        : { updatedAt: sortOrder as "asc" | "desc" };

  const dossiers = await db.dossier.findMany({
    where: {
      userId: { in: ownerIds },
      moduleType,
      ...(search && {
        fullName: {
          contains: search,
          mode: "insensitive" as const,
        },
      }),
      ...(status && { status }),
    },
    include: DOSSIER_INCLUDE,
    orderBy,
  });

  return dossiers.map(toDossierWithDocuments);
}

/** Lightweight lookup used to decide which period picker (trimestre/mois) to show when sending an email for this dossier. */
export async function getDossierSendingFrequency(
  id: string
): Promise<SendingFrequency | null> {
  const { ownerIds } = await requireOwnerScope();
  const dossier = await db.dossier.findFirst({
    where: { id, userId: { in: ownerIds } },
    select: { sendingFrequency: true },
  });
  return dossier?.sendingFrequency ?? null;
}

export async function getDossier(
  id: string
): Promise<DossierWithDocuments | null> {
  const { ownerIds } = await requireOwnerScope();

  const dossier = await db.dossier.findFirst({
    where: { id, userId: { in: ownerIds } },
    include: DOSSIER_INCLUDE,
  });

  return dossier ? toDossierWithDocuments(dossier) : null;
}

/**
 * The MJPM a new dossier belongs to. Solo accounts and MJPMs: themselves.
 * Assistants: the MJPM chosen in the form, else the one selected in the
 * header; it must be one of theirs.
 */
async function resolveNewDossierOwner(scope: OwnerScope, requested?: string): Promise<string> {
  if (scope.actor.orgRole !== "ASSISTANT") {
    if (scope.ownerIds.length === 0) throw new Error("Ce compte n'a pas acces aux dossiers");
    return scope.actorId;
  }
  const selection = await readMandataireSelection();
  const candidate = requested ?? (selection !== "all" ? selection : undefined);
  if (!candidate) throw new Error("Choisissez le mandataire du dossier");
  if (!scope.ownerIds.includes(candidate)) throw new Error("Mandataire non autorise");
  return candidate;
}

export async function createDossier(
  moduleType: ModuleType,
  data: DossierFormData,
  /** Assistants: the MJPM the dossier is for. Ignored for everyone else. */
  ownerId?: string
): Promise<{ success: boolean; id?: string; owner?: { id: string; name: string }; error?: string }> {
  try {
    const scope = await requireOwnerScope();
    const userId = await resolveNewDossierOwner(scope, ownerId);
    const validated = dossierSchema.parse(data);
    await assertTemplateUsable(validated.defaultTemplateId, scope);

    const { additionalModules, ...dossierData } = validated;

    // De-duplicate in case the primary module was somehow included twice.
    const targetModules = [
      moduleType,
      ...additionalModules.filter((m) => m !== moduleType),
    ];
    const groupId = targetModules.length > 1 ? randomUUID() : null;

    // Resolve each module's default template before creating anything —
    // the primary module honors the user's explicit choice, the rest fall
    // back to their own global default.
    const templateIdByModule = new Map<ModuleType, string | null>();
    for (const m of targetModules) {
      templateIdByModule.set(
        m,
        m === moduleType
          ? (dossierData.defaultTemplateId ?? (await getDefaultGlobalTemplateId(m)))
          : await getDefaultGlobalTemplateId(m)
      );
    }

    const created = await db.$transaction((tx) =>
      Promise.all(
        targetModules.map((m) =>
          tx.dossier.create({
            data: {
              fullName: dossierData.fullName,
              priority: dossierData.priority,
              status: dossierData.status,
              notes: dossierData.notes ?? null,
              primaryEmail: dossierData.primaryEmail || null,
              ccEmails: dossierData.ccEmails,
              bccEmails: dossierData.bccEmails,
              moduleType: m,
              userId,
              createdById: scope.actorId,
              defaultTemplateId: templateIdByModule.get(m) ?? null,
              sendingFrequency: dossierData.sendingFrequency ?? "QUARTERLY",
              groupId,
            },
          })
        )
      )
    );

    revalidateModulePaths();
    const primary = created.find((d) => d.moduleType === moduleType) ?? created[0];
    const owner = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return {
      success: true,
      id: primary.id,
      owner: { id: userId, name: owner?.name || owner?.email || "" },
    };
  } catch (error) {
    console.error("Error creating dossier:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Erreur: ${message}`,
    };
  }
}

export async function updateDossier(
  id: string,
  data: Partial<DossierFormData>
): Promise<{ success: boolean; error?: string }> {
  try {
    const scope = await requireOwnerScope();

    // Check access
    const existing = await db.dossier.findFirst({
      where: { id, userId: { in: scope.ownerIds } },
    });

    if (!existing) {
      return { success: false, error: "Dossier non trouve" };
    }

    const validated = dossierSchema.partial().parse(data);
    await assertTemplateUsable(validated.defaultTemplateId, scope);

    // Strip additionalModules from the update payload -- it is only
    // relevant at creation time.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { additionalModules: _ignored, ...updatePayload } = validated;

    await db.dossier.update({
      where: { id },
      data: {
        ...updatePayload,
        primaryEmail: updatePayload.primaryEmail || null,
      },
    });

    revalidateModulePaths();
    return { success: true };
  } catch (error) {
    console.error("Error updating dossier:", error);
    return {
      success: false,
      error: "Erreur lors de la mise a jour du dossier",
    };
  }
}

export async function getTemplatesForModule(
  moduleType: ModuleType
): Promise<{ id: string; name: string; isDefault: boolean; isGlobal: boolean }[]> {
  // Global templates, the user's own, and those of the MJPMs they work for.
  const { actorId, ownerIds } = await requireOwnerScope();
  return db.emailTemplate.findMany({
    where: {
      dossierId: null,
      category: moduleType as TemplateCategory,
      OR: [{ isGlobal: true }, { userId: { in: [actorId, ...ownerIds] } }],
    },
    select: { id: true, name: true, isDefault: true, isGlobal: true },
    orderBy: [{ isGlobal: "desc" }, { isDefault: "desc" }, { name: "asc" }],
  });
}

/** Find the global quarterly default template for a module. Used for auto-assigning on creation. */
async function getDefaultGlobalTemplateId(
  moduleType: ModuleType
): Promise<string | null> {
  const tpl = await db.emailTemplate.findFirst({
    where: { isGlobal: true, isDefault: true, category: moduleType as TemplateCategory },
    select: { id: true },
  });
  return tpl?.id ?? null;
}

export async function deleteDossier(
  id: string,
  scope: "one" | "group" = "one"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { ownerIds } = await requireOwnerScope();

    // Check access
    const existing = await db.dossier.findFirst({
      where: { id, userId: { in: ownerIds } },
    });

    if (!existing) {
      return { success: false, error: "Dossier non trouve" };
    }

    const userId = existing.userId;
    const idsToDelete =
      scope === "group" && existing.groupId
        ? (
            await db.dossier.findMany({
              where: { groupId: existing.groupId, userId },
              select: { id: true },
            })
          ).map((d) => d.id)
        : [id];

    // Files first: once the rows are gone their paths are lost, and personal
    // data must not stay on disk.
    const files = await db.document.findMany({
      where: { dossierId: { in: idsToDelete } },
      select: { blobUrl: true },
    });
    for (const file of files) await removeDocumentFile(file.blobUrl);

    await db.dossier.deleteMany({
      where: { id: { in: idsToDelete }, userId },
    });

    revalidateModulePaths();
    return { success: true };
  } catch (error) {
    console.error("Error deleting dossier:", error);
    return {
      success: false,
      error: "Erreur lors de la suppression du dossier",
    };
  }
}
