import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware using auth config without database access.
 * This runs in Edge Runtime where Prisma is not supported.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - phone install files (manifest, icons/): read before any login
     * - .well-known/assetlinks.json: proves the Android app is ours (no address bar)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|icon\\.ico|icons/|manifest\\.webmanifest|\\.well-known/assetlinks\\.json|public).*)",
  ],
};
