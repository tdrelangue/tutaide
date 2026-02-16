import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { authConfig } from "./auth.config";

const IMPERSONATION_COOKIE = "tutaide-impersonate";

/**
 * Full auth configuration with database access.
 * Only used in Server Components and API routes, NOT in middleware.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) return null;

        // Block archived users
        if (user.archivedAt !== null) return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Get the current session user's ID, or null if not authenticated */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Returns the effective userId: the impersonated user if impersonation
 * is active and the current user is an admin, otherwise the session user.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Only admins can impersonate
  if (session.user.role === "ADMIN") {
    const cookieStore = await cookies();
    const impersonatedId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
    if (impersonatedId) {
      // Validate the impersonated user exists
      const target = await db.user.findUnique({
        where: { id: impersonatedId },
        select: { id: true, archivedAt: true },
      });
      if (target && target.archivedAt === null) {
        return target.id;
      }
    }
  }

  return session.user.id;
}

/** Require authentication, throw if not logged in. Uses effective userId (supports impersonation). */
export async function requireAuth(): Promise<string> {
  const userId = await getEffectiveUserId();
  if (!userId) {
    throw new Error("Non authentifie");
  }
  return userId;
}

/** Require ADMIN role. Always returns the real admin's ID (not impersonated). */
export async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non authentifie");
  }
  if (session.user.role !== "ADMIN") {
    throw new Error("Acces refuse");
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

/**
 * Returns impersonation state for rendering the banner.
 * Returns null if not impersonating.
 */
export async function getImpersonationState(): Promise<{
  adminId: string;
  adminEmail: string;
  targetId: string;
  targetEmail: string;
  targetName: string | null;
} | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;

  const cookieStore = await cookies();
  const impersonatedId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!impersonatedId) return null;

  const target = await db.user.findUnique({
    where: { id: impersonatedId },
    select: { id: true, email: true, name: true, archivedAt: true },
  });

  if (!target || target.archivedAt !== null) return null;

  return {
    adminId: session.user.id,
    adminEmail: session.user.email,
    targetId: target.id,
    targetEmail: target.email,
    targetName: target.name,
  };
}

/** Start impersonating a user (admin only). */
export async function startImpersonation(targetUserId: string): Promise<void> {
  await requireAdmin();

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) throw new Error("Utilisateur introuvable");

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, targetUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
}

/** Stop impersonating. */
export async function stopImpersonation(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);
}
