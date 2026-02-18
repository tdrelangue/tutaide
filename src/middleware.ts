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
     */
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|icon\\.ico|public).*)",
  ],
};
