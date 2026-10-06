import os from "os";
import path from "path";
import type { PrismaClient } from "@prisma/client";

/**
 * Demo mode ("Tester l'application"). While it is on, the whole local server
 * talks to an in-memory database (PGlite) instead of the real one, and no
 * email leaves the machine. The desktop app runs one local server per user,
 * so a process-wide switch is the right scope. Nothing here is persisted: the
 * in-memory database disappears when the demo ends or the app closes.
 */

export type DemoRuntime = {
  client: PrismaClient;
  close: () => Promise<void>;
  email: string;
};

const holder = globalThis as unknown as { __tutelliaDemo?: DemoRuntime | null };

/** Demo accounts never exist in the real database; this reserved domain marks them. */
export const DEMO_EMAIL_DOMAIN = "demo.tutellia.invalid";

/**
 * Only the installed desktop app (TUTELLIA_DESKTOP=1, set by the Tauri shell)
 * and local development may start a demo — never the shared web deployment,
 * where a process-wide switch would affect every visitor.
 */
export function isDemoAllowed(): boolean {
  return process.env.TUTELLIA_DESKTOP === "1" || process.env.NODE_ENV === "development";
}

export function getDemoRuntime(): DemoRuntime | null {
  return holder.__tutelliaDemo ?? null;
}

export function setDemoRuntime(runtime: DemoRuntime | null): void {
  holder.__tutelliaDemo = runtime;
}

export function isDemoActive(): boolean {
  return getDemoRuntime() !== null;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Demo documents live in the system temp folder, wiped at every demo start and end. */
export function getDemoDocumentsDir(): string {
  return path.join(os.tmpdir(), "tutellia-demo", "documents");
}
