import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { getDemoRuntime } from "./demo/state";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makePrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends(withAccelerate()) as unknown as PrismaClient;
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
