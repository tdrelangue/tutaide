"use server";

import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
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
  const userId = await requireAuth();
  const dossier = await db.dossier.findFirst({
    where: { id: dossierId, userId },
    select: { groupId: true },
  });
  if (!dossier?.groupId) return [];

  return db.dossier.findMany({
    where: { groupId: dossier.groupId, userId, id: { not: dossierId } },
    select: { id: true, moduleType: true, status: true },
  });
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
  const userId = await requireAuth();

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
      userId,
      moduleType,
      ...(search && {
        fullName: {
          contains: search,
          mode: "insensitive" as const,
        },
      }),
      ...(status && { status }),
    },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
          blobUrl: true,
        },
      },
      defaultTemplate: {
        select: { id: true, name: true },
      },
    },
    orderBy,
  });

  // Filter out documents whose file no longer exists on this machine
  // (e.g. uploaded from another computer with the same account)
  return dossiers.map((dossier) => {
    const localDocs = dossier.documents.filter((doc) => existsSync(doc.blobUrl));
    return {
      ...dossier,
      documents: localDocs.map(({ blobUrl: _url, ...doc }) => doc),
      _count: { documents: localDocs.length },
    };
  });
}

/** Lightweight lookup used to decide which period picker (trimestre/mois) to show when sending an email for this dossier. */
export async function getDossierSendingFrequency(
  id: string
): Promise<SendingFrequency | null> {
  const userId = await requireAuth();
  const dossier = await db.dossier.findFirst({
    where: { id, userId },
    select: { sendingFrequency: true },
  });
  return dossier?.sendingFrequency ?? null;
}

export async function getDossier(
  id: string
): Promise<DossierWithDocuments | null> {
  const userId = await requireAuth();

  const dossier = await db.dossier.findFirst({
    where: { id, userId },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
          blobUrl: true,
        },
      },
      defaultTemplate: {
        select: { id: true, name: true },
      },
    },
  });

  if (!dossier) return null;

  const localDocs = dossier.documents.filter((doc) => existsSync(doc.blobUrl));
  return {
    ...dossier,
    documents: localDocs.map(({ blobUrl: _url, ...doc }) => doc),
    _count: { documents: localDocs.length },
  };
}

export async function createDossier(
  moduleType: ModuleType,
  data: DossierFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = dossierSchema.parse(data);

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
    return { success: true, id: primary.id };
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
    const userId = await requireAuth();

    // Check ownership
    const existing = await db.dossier.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return { success: false, error: "Dossier non trouve" };
    }

    const validated = dossierSchema.partial().parse(data);

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
  const userId = await requireAuth();
  return db.emailTemplate.findMany({
    where: {
      dossierId: null,
      category: moduleType as TemplateCategory,
      OR: [{ isGlobal: true }, { userId }],
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
    const userId = await requireAuth();

    // Check ownership
    const existing = await db.dossier.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return { success: false, error: "Dossier non trouve" };
    }

    const idsToDelete =
      scope === "group" && existing.groupId
        ? (
            await db.dossier.findMany({
              where: { groupId: existing.groupId, userId },
              select: { id: true },
            })
          ).map((d) => d.id)
        : [id];

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
