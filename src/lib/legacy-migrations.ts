import { randomUUID } from "crypto";
import { db } from "@/lib/db";

/**
 * App versions built before groupId (2.0.7) still write cross-module dossier
 * links via the legacy pairwise `linkedDossierId` field, since users update
 * on their own schedule and can't be forced onto the new build. Current code
 * reads/writes links via `groupId` instead. Running this on every session
 * heals any legacy-created pairs into a group, so old and new app versions
 * can keep writing to the same database indefinitely without data loss.
 */
export async function migrateLegacyLinkedDossiers(userId: string): Promise<void> {
  const legacyLinked = await db.dossier.findMany({
    where: { userId, linkedDossierId: { not: null }, groupId: null },
    select: { id: true, linkedDossierId: true },
  });

  for (const dossier of legacyLinked) {
    // May already have been migrated as the partner of a pair processed
    // earlier in this same loop.
    const fresh = await db.dossier.findUnique({
      where: { id: dossier.id },
      select: { groupId: true },
    });
    if (fresh?.groupId) continue;

    const partner = dossier.linkedDossierId
      ? await db.dossier.findUnique({
          where: { id: dossier.linkedDossierId },
          select: { id: true, groupId: true },
        })
      : null;

    const groupId = partner?.groupId ?? randomUUID();

    await db.dossier.update({ where: { id: dossier.id }, data: { groupId } });
    if (partner && !partner.groupId) {
      await db.dossier.update({ where: { id: partner.id }, data: { groupId } });
    }
  }
}
