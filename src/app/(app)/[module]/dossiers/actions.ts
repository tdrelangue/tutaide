"use server";

import { existsSync } from "fs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { dossierSchema, type DossierFormData } from "@/lib/validations";
import type {
  DossierPriority,
  DossierStatus,
  ModuleType,
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
  linkedDossierId: string | null;
  documents: {
    id: string;
    filename: string;
    createdAt: Date;
  }[];
  _count: {
    documents: number;
  };
};

function getOtherModuleType(moduleType: ModuleType): ModuleType {
  return moduleType === "APA" ? "ASH" : "APA";
}

function revalidateModulePaths(): void {
  revalidatePath("/apa/dossiers");
  revalidatePath("/ash/dossiers");
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
      documents: localDocs.map(({ blobUrl: _url, ...doc }) => doc),
      _count: { documents: localDocs.length },
    };
  });
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

export async function createDossier(
  moduleType: ModuleType,
  data: DossierFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const validated = dossierSchema.parse(data);

    const { addToOtherModule, ...dossierData } = validated;

    if (addToOtherModule) {
      // Create both dossiers in a transaction, linking them together
      const otherModule = getOtherModuleType(moduleType);

      const result = await db.$transaction(async (tx) => {
        // Create the primary dossier
        const primaryDossier = await tx.dossier.create({
          data: {
            fullName: dossierData.fullName,
            priority: dossierData.priority,
            status: dossierData.status,
            notes: dossierData.notes ?? null,
            primaryEmail: dossierData.primaryEmail || null,
            ccEmails: dossierData.ccEmails,
            bccEmails: dossierData.bccEmails,
            moduleType,
            userId,
          },
        });

        // Create the linked dossier in the other module
        const linkedDossier = await tx.dossier.create({
          data: {
            fullName: dossierData.fullName,
            priority: dossierData.priority,
            status: dossierData.status,
            notes: dossierData.notes ?? null,
            primaryEmail: dossierData.primaryEmail || null,
            ccEmails: dossierData.ccEmails,
            bccEmails: dossierData.bccEmails,
            moduleType: otherModule,
            userId,
            linkedDossierId: primaryDossier.id,
          },
        });

        // Update the primary dossier to point back to the linked one
        await tx.dossier.update({
          where: { id: primaryDossier.id },
          data: { linkedDossierId: linkedDossier.id },
        });

        return primaryDossier;
      });

      revalidateModulePaths();
      return { success: true, id: result.id };
    }

    // Single dossier creation (no linking)
    const dossier = await db.dossier.create({
      data: {
        fullName: dossierData.fullName,
        priority: dossierData.priority,
        status: dossierData.status,
        notes: dossierData.notes ?? null,
        primaryEmail: dossierData.primaryEmail || null,
        ccEmails: dossierData.ccEmails,
        bccEmails: dossierData.bccEmails,
        moduleType,
        userId,
      },
    });

    revalidateModulePaths();
    return { success: true, id: dossier.id };
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

    // Strip addToOtherModule from the update payload -- it is only
    // relevant at creation time.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { addToOtherModule: _ignored, ...updatePayload } = validated;

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

export async function deleteDossier(
  id: string
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

    // If this dossier is linked, unlink the sibling first so the
    // unique constraint on linkedDossierId is not violated.
    if (existing.linkedDossierId) {
      await db.$transaction(async (tx) => {
        // Remove the back-reference on the sibling
        await tx.dossier.update({
          where: { id: existing.linkedDossierId! },
          data: { linkedDossierId: null },
        });

        // Remove the forward reference, then delete
        await tx.dossier.update({
          where: { id },
          data: { linkedDossierId: null },
        });

        await tx.dossier.delete({
          where: { id },
        });
      });
    } else {
      // Check if another dossier points to this one (linkedBy side)
      const sibling = await db.dossier.findFirst({
        where: { linkedDossierId: id },
      });

      if (sibling) {
        await db.$transaction(async (tx) => {
          await tx.dossier.update({
            where: { id: sibling.id },
            data: { linkedDossierId: null },
          });

          await tx.dossier.delete({
            where: { id },
          });
        });
      } else {
        await db.dossier.delete({
          where: { id },
        });
      }
    }

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
