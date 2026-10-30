import { PrismaClient } from "@prisma/client";
import { withPoolLimits } from "./db-pool";
import { withConnectionRetry } from "./db-retry";
import { getDemoRuntime } from "./demo/state";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Plain TCP client (Accelerate is retired by Prisma on 2026-12-01).
 * Each copy keeps few connections (db-pool).
 * Every query rides out short connection outages (db-retry) instead of failing the page.
 */
function makePrisma(): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: withPoolLimits(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allOperations({ args, query }) {
        return withConnectionRetry(() => query(args));
      },
    },
  });
  // Safe: a query-only extension keeps every model and method of PrismaClient unchanged.
  return client as unknown as PrismaClient;
}

const realDb = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = realDb;

/**
 * The database client used everywhere. During a demo ("Tester l'application")
 * every call is routed to the in-memory demo database instead (lib/demo), so
 * a demo can never read or write real data.
 */
export const db: PrismaClient = new Proxy(realDb, {
  get(target, property) {
    const active = getDemoRuntime()?.client ?? target;
    const value: unknown = Reflect.get(active, property);
    return typeof value === "function" ? value.bind(active) : value;
  },
});
