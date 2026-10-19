import { db } from "@/lib/db";
import { AgendaConflict } from "./errors";

/** Prisma Accelerate allows 15 s at most: writes of many rows get the whole budget. */
export const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const STALE_MESSAGE = "Le planning a changé entre-temps. Rien n'a été modifié. Rechargez la page.";

/**
 * The per-owner planning lock. Every planning write starts here, with the
 * `version` of the settings row seen when the state was loaded: if anyone
 * wrote since, the plan was computed on a stale state and nothing is written.
 * The row lock also makes two simultaneous planning writes queue up.
 */
export async function lockPlanning(tx: Tx, ownerId: string, version: number): Promise<void> {
  const { count } = await tx.agendaSettings.updateMany({
    where: { ownerId, version },
    data: { version: { increment: 1 } },
  });
  if (count !== 1) throw new AgendaConflict(STALE_MESSAGE);
}

/** Same lock for a write that computed nothing from a loaded state (e.g. deleting an appointment): it only queues. */
export async function queuePlanning(tx: Tx, ownerId: string): Promise<void> {
  await tx.agendaSettings.updateMany({ where: { ownerId }, data: { version: { increment: 1 } } });
}
