import { cookies } from "next/headers";
import { getEffectiveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canWorkOnDossiers,
  resolveOwnerIds,
  validMandataireIds,
  type Actor,
  type AssignedMandataire,
  type MandataireSelection,
} from "./scope";

/**
 * Server side of the access rules (scope.ts). The actor's organisation role
 * and assignments are read from the DB on every call — never from the login
 * token — so a reassignment by the organisation admin applies immediately.
 * Impersonation keeps working: the actor is the effective user.
 */

/** Cookie holding the assistant's chosen MJPM ("all" or a user id). */
export const MANDATAIRE_COOKIE = "tutaide-mandataire";

export type ActorContext = { actor: Actor; assigned: AssignedMandataire[] };

export async function getActorContext(): Promise<ActorContext | null> {
  const userId = await getEffectiveUserId();
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      orgId: true,
      orgRole: true,
      isOrgAdmin: true,
      organization: { select: { archivedAt: true } },
      assistantAssignments: {
        select: { mandataire: { select: { id: true, orgId: true, orgRole: true, archivedAt: true } } },
      },
    },
  });
  if (!user) return null;

  // An archived organisation keeps its members' accounts but gives them nothing.
  const isOrgClosed = user.organization?.archivedAt != null;
  const actor: Actor = {
    id: user.id,
    orgId: user.orgId,
    orgRole: isOrgClosed ? null : user.orgRole,
    isOrgAdmin: !isOrgClosed && user.isOrgAdmin,
  };
  const assigned = user.assistantAssignments.map(({ mandataire: m }) => ({
    id: m.id,
    orgId: m.orgId,
    orgRole: m.orgRole,
    archived: m.archivedAt !== null,
  }));
  return { actor, assigned };
}

export async function requireActorContext(): Promise<ActorContext> {
  const context = await getActorContext();
  if (!context) throw new Error("Non authentifie");
  return context;
}

export async function readMandataireSelection(): Promise<MandataireSelection> {
  const value = (await cookies()).get(MANDATAIRE_COOKIE)?.value;
  return value && value.length > 0 ? value : "all";
}

export type OwnerScope = { actorId: string; actor: Actor; ownerIds: string[] };

/**
 * The owners whose dossiers the actor may act on.
 * `narrowed: true` applies the assistant's chosen MJPM — for lists (what the
 * screen shows). Actions on one given dossier use the full set, so a stale
 * selection never blocks them.
 */
export async function requireOwnerScope(options: { narrowed?: boolean } = {}): Promise<OwnerScope> {
  const { actor, assigned } = await requireActorContext();
  const selection = options.narrowed ? await readMandataireSelection() : "all";
  return { actorId: actor.id, actor, ownerIds: resolveOwnerIds(actor, assigned, selection) };
}

/**
 * The owner of a dossier the actor may act on, or null when the dossier does
 * not exist or is out of reach (treated the same: "Dossier non trouve").
 */
export async function findAccessibleDossierOwner(
  dossierId: string
): Promise<{ ownerId: string; actorId: string } | null> {
  const { actorId, ownerIds } = await requireOwnerScope();
  if (ownerIds.length === 0) return null;
  const dossier = await db.dossier.findFirst({
    where: { id: dossierId, userId: { in: ownerIds } },
    select: { userId: true },
  });
  return dossier ? { ownerId: dossier.userId, actorId } : null;
}

export type MandataireChoice = { id: string; name: string };

/** The MJPMs an assistant can choose from (empty for everyone else). */
export async function listMandataireChoices(): Promise<MandataireChoice[]> {
  const context = await getActorContext();
  if (!context) return [];
  const ids = validMandataireIds(context.actor, context.assigned);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return users
    .map((u) => ({ id: u.id, name: u.name || u.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Whether the current account works on dossiers (false for admin-only accounts). */
export async function currentUserWorksOnDossiers(): Promise<boolean> {
  const context = await getActorContext();
  return context ? canWorkOnDossiers(context.actor) : false;
}

/**
 * For the legacy pages (/dossiers, /history) still scoped to the user's own
 * data: organisation members must use the module pages, so their actions
 * refuse them too (server actions can be called without the page).
 */
export async function requireSoloUserId(): Promise<string> {
  const { actor } = await requireActorContext();
  if (actor.orgId !== null) throw new Error("Utilisez les pages APA, ASH ou PCH");
  return actor.id;
}

export type OrgAdminContext = { actorId: string; orgId: string };

export async function requireOrgAdmin(): Promise<OrgAdminContext> {
  const { actor } = await requireActorContext();
  if (!actor.isOrgAdmin || actor.orgId === null) {
    throw new Error("Acces reserve a l'administrateur de la structure");
  }
  return { actorId: actor.id, orgId: actor.orgId };
}
