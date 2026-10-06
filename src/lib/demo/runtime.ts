import fs from "fs/promises";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { DEMO_SCHEMA_SQL } from "./schema-sql";
import { seedDemoAccount } from "./seed";
import {
  DEMO_EMAIL_DOMAIN,
  getDemoDocumentsDir,
  getDemoRuntime,
  isDemoAllowed,
  setDemoRuntime,
} from "./state";

/** Root of everything a demo writes to disk (documents), wiped at start and end. */
function demoDiskRoot(): string {
  return path.dirname(getDemoDocumentsDir());
}

/** Ends the running demo, if any: drops the in-memory database and the demo files. */
export async function endDemo(): Promise<void> {
  const runtime = getDemoRuntime();
  setDemoRuntime(null);
  if (runtime) await runtime.close().catch(() => undefined);
  await fs.rm(demoDiskRoot(), { recursive: true, force: true }).catch(() => undefined);
}

/** A fresh in-memory PostgreSQL with Tutellia's tables, nothing else. */
async function createDemoClient(): Promise<{ client: PrismaClient; close: () => Promise<void> }> {
  // Loaded on demand: the web deployment never starts a demo.
  const { PGlite } = await import("@electric-sql/pglite");
  const { PrismaPGlite } = await import("pglite-prisma-adapter");
  const pg = new PGlite();
  await pg.exec(DEMO_SCHEMA_SQL);
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  return {
    client,
    close: async () => {
      await client.$disconnect();
      await pg.close();
    },
  };
}

/**
 * Starts a demo: from now on every database call of this local server goes to
 * a new in-memory database holding one fictional account. Returns the
 * throwaway credentials the login page signs in with.
 */
export async function startDemo(): Promise<{ email: string; password: string }> {
  if (!isDemoAllowed()) throw new Error("La démonstration n'est disponible que dans l'application installée.");
  await endDemo();

  const { client, close } = await createDemoClient();
  const email = `demo-${randomUUID().slice(0, 8)}@${DEMO_EMAIL_DOMAIN}`;
  const password = randomBytes(18).toString("base64url");
  setDemoRuntime({ client, close, email });

  try {
    const user = await db.user.create({
      data: {
        email,
        name: "Marie Dupont (démonstration)",
        passwordHash: await hash(password, 10),
        signature: "Marie Dupont\nMandataire judiciaire à la protection des majeurs\n01 23 45 67 89",
      },
    });
    await seedDemoAccount(user.id);
  } catch (error) {
    await endDemo();
    throw error;
  }
  return { email, password };
}
