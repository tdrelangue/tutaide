import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth configuration that can be used in Edge Runtime (middleware).
 * Does NOT include database adapter or authorize function.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    // Credentials provider config without authorize (added in auth.ts)
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath = nextUrl.pathname === "/login" ||
                          nextUrl.pathname === "/signup" ||
                          nextUrl.pathname === "/forgot-password" ||
                          nextUrl.pathname.startsWith("/api/auth") ||
                          // Called server-to-server by desktop installs (see lib/billing.ts)
                          nextUrl.pathname.startsWith("/api/billing/");

      if (isPublicPath) {
        // Redirect logged-in users away from login / signup
        if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/signup")) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Require auth for all other paths
      if (!isLoggedIn) return false;

      // Protect /admin routes: only ADMIN role
      if (nextUrl.pathname.startsWith("/admin")) {
        const role = auth?.user?.role;
        if (role !== "ADMIN") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
};
