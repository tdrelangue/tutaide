"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin, startImpersonation, stopImpersonation } from "@/lib/auth";
import { z } from "zod";
import { seedDefaultTemplates } from "@/lib/default-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminUserData = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    dossiers: number;
    documents: number;
  };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.string().email("Email invalide"),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caracteres").optional(),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caracteres"),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

const updateUserSchema = z.object({
  email: z.string().email("Email invalide").optional(),
  name: z.string().min(2).optional().nullable(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caracteres")
    .optional()
    .or(z.literal("")),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** List all users (admin only) */
export async function getUsers(): Promise<AdminUserData[]> {
  await requireAdmin();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          dossiers: true,
          documents: true,
        },
      },
    },
  });

  return users;
}

/** Create a new user (admin only) */
export async function createUser(data: {
  email: string;
  name?: string;
  password: string;
  role?: "USER" | "ADMIN";
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireAdmin();
    const validated = createUserSchema.parse(data);

    const existing = await db.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    if (existing) {
      return { success: false, error: "Cet email est deja utilise" };
    }

    const passwordHash = await hash(validated.password, 12);

    const user = await db.user.create({
      data: {
        email: validated.email.toLowerCase(),
        name: validated.name ?? null,
        passwordHash,
        role: validated.role ?? "USER",
      },
    });

    await seedDefaultTemplates(user.id);

    revalidatePath("/admin/users");
    return { success: true, id: user.id };
  } catch (error) {
    console.error("Error creating user:", error);
    return { success: false, error: "Erreur lors de la creation" };
  }
}

/** Update a user (admin only) */
export async function updateUser(
  userId: string,
  data: {
    email?: string;
    name?: string | null;
    password?: string;
    role?: "USER" | "ADMIN";
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validated = updateUserSchema.parse(data);

    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return { success: false, error: "Utilisateur introuvable" };
    }

    // Check email uniqueness if changing
    if (validated.email && validated.email.toLowerCase() !== existing.email) {
      const emailTaken = await db.user.findUnique({
        where: { email: validated.email.toLowerCase() },
      });
      if (emailTaken) {
        return { success: false, error: "Cet email est deja utilise" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (validated.email) updateData.email = validated.email.toLowerCase();
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.role) updateData.role = validated.role;
    if (validated.password && validated.password.length > 0) {
      updateData.passwordHash = await hash(validated.password, 12);
    }

    await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Erreur lors de la mise a jour" };
  }
}

/** Archive a user (admin only) */
export async function archiveUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminId = await requireAdmin();

    if (userId === adminId) {
      return { success: false, error: "Vous ne pouvez pas archiver votre propre compte" };
    }

    await db.user.update({
      where: { id: userId },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error archiving user:", error);
    return { success: false, error: "Erreur lors de l'archivage" };
  }
}

/** Unarchive a user (admin only) */
export async function unarchiveUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await db.user.update({
      where: { id: userId },
      data: { archivedAt: null },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error unarchiving user:", error);
    return { success: false, error: "Erreur lors de la reactivation" };
  }
}

/** Start impersonation (admin only) */
export async function startImpersonationAction(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await startImpersonation(targetUserId);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return { success: false, error: "Erreur lors de la connexion au compte" };
  }
}

/** Stop impersonation (admin only) */
export async function stopImpersonationAction(): Promise<void> {
  await stopImpersonation();
  revalidatePath("/");
}
