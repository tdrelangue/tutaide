import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { DEMO_SCHEMA_SQL } from "@/lib/demo/schema-sql";
import { setDemoRuntime } from "@/lib/demo/state";

/**
 * A fresh in-memory PostgreSQL with Tutellia's tables. `db` (lib/db) is routed
 * to it exactly like during a demo, so the code under test never sees a real database.
 */
export async function createTestDb(): Promise<{ client: PrismaClient; close: () => Promise<void> }> {
  const pg = new PGlite();
  await pg.exec(DEMO_SCHEMA_SQL);
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  setDemoRuntime({ client, close: async () => undefined, email: "test@demo.tutellia.invalid" });
  return {
    client,
    close: async () => {
      setDemoRuntime(null);
      await client.$disconnect();
      await pg.close();
    },
  };
}

export async function createUser(client: PrismaClient, email: string): Promise<string> {
  return (await client.user.create({ data: { email, passwordHash: "x" } })).id;
}
