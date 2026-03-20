"use server";

import { existsSync } from "fs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { dossierSchema, type DossierFormData } from "@/lib/validations";
import type { DossierPriority, DossierStatus } from "@prisma/client";

export type DossierWithDocuments = {
  id: string;
  fullName: string;
  priority: DossierPriority;
  status: DossierStatus;
  notes: string | null;
  primaryEmail: string | null;
  ccEmails: string[];
  bccEmails: string[];
  createdAt: Date;
  updatedAt: Date;
  documents: {
    id: string;
    filename: string;
    createdAt: Date;
  }[];
  _count: {
    documents: number;
  };
};

export async function getDossiers(params?: {
  search?: string;
  priority?: DossierPriority;
  sortBy?: "updatedAt" | "fullName" | "priority";
  sortOrder?: "asc" | "desc";
}): Promise<DossierWithDocuments[]> {
  const userId = await requireAuth();

  const { search, priority, sortBy = "updatedAt", sortOrder = "desc" } = params || {};

  const orderBy = sortBy === "priority"
    ? { priority: sortOrder }
    : sortBy === "fullName"
    ? { fullName: sortOrder }
    : { updatedAt: sortOrder };

  const dossiers = await db.dossier.findMany({
    where: {
      userId,
      ...(search && {
        fullName: {
          contains: search,
          mode: "insensitive",
        },
      }),
      ...(priority && { priority }),
    },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          createdAt: true,
          blobUrl: true,
        },
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
      documents: localDocs.slice(0, 3).map(({ blobUrl: _url, ...doc }) => doc),
      _count: { documents: localDocs.length },
    };
  });
}

export async function getDossier(id: string): Promise<DossierWithDocuments | null> {
  const userId = await requireAuth();

  const dossier = await db.dossier.findFirst({
    where: { id, userId },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          createdAt: true,
          blobUrl: true,
        },
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

export async function createDossier(data: DossierFormData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = dossierSchema.parse(data);

    // Strip addToOtherModule — not a DB field, only used at creation time in the module version
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { addToOtherModule: _ignored, ...dossierData } = validated;

    const dossier = await db.dossier.create({
      data: {
        ...dossierData,
        primaryEmail: dossierData.primaryEmail || null,
        userId,
      },
    });

    revalidatePath("/dossiers");
    return { success: true, id: dossier.id };
  } catch (error) {
    console.error("Error creating dossier:", error);
    return { success: false, error: "Erreur lors de la création du dossier" };
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
      return { success: false, error: "Dossier non trouvé" };
    }

    const validated = dossierSchema.partial().parse(data);

    await db.dossier.update({
      where: { id },
      data: {
        ...validated,
        primaryEmail: validated.primaryEmail || null,
      },
    });

    revalidatePath("/dossiers");
    return { success: true };
  } catch (error) {
    console.error("Error updating dossier:", error);
    return { success: false, error: "Erreur lors de la mise à jour du dossier" };
  }
}

export async function deleteDossier(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAuth();

    // Check ownership
    const existing = await db.dossier.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return { success: false, error: "Dossier non trouvé" };
    }

    await db.dossier.delete({
      where: { id },
    });

    revalidatePath("/dossiers");
    return { success: true };
  } catch (error) {
    console.error("Error deleting dossier:", error);
    return { success: false, error: "Erreur lors de la suppression du dossier" };
  }
}
