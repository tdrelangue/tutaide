import { db } from "@/lib/db";
import { isDemoActive } from "@/lib/demo/state";
import { requireActorContext, requireOwnerScope } from "@/lib/access/context";
import { canWorkOnDossiers, resolveOwnerIds } from "@/lib/access/scope";
import { hasAgendaAccess, pickAgendaOwner } from "./rules";

/**
 * Who may open which agenda. The agenda belongs to an MJPM (the owner, like
 * dossiers). An assistant works on the agenda of the MJPM chosen in the MJPM
 * picker. The add-on is held by the owner's account: an assistant sees it
 * for the MJPMs who have it. Admin-only accounts (IT) never see it.
 */

export type AgendaAccess =
  | { status: "ok"; ownerId: string; actorId: string; ownerName: string }
  /** Assistant: several MJPMs with the add-on and "all" selected, or the chosen MJPM lacks it. */
  | { status: "choose" }
  /** No working role, or the owner does not hold the add-on. */
  | { status: "unavailable" };

async function ownersWithAgenda(ownerIds: string[]): Promise<{ id: string; name: string | null; email: string }[]> {
  if (ownerIds.length === 0) return [];
  const owners = await db.user.findMany({
    where: { id: { in: ownerIds }, archivedAt: null },
    select: { id: true, name: true, email: true, agendaGranted: true },
  });
  const isDemo = isDemoActive();
  return owners.filter((o) => hasAgendaAccess(o, isDemo));
}

export async function getAgendaAccess(): Promise<AgendaAccess> {
  const { actorId, actor, ownerIds } = await requireOwnerScope({ narrowed: true });
  if (!canWorkOnDossiers(actor)) return { status: "unavailable" };
  const owners = await ownersWithAgenda(ownerIds);
  const pick = pickAgendaOwner(owners.map((o) => o.id));
  if (pick.kind === "owner") {
    const owner = owners[0];
    return { status: "ok", ownerId: pick.ownerId, actorId, ownerName: owner.name || owner.email };
  }
  if (pick.kind === "choose") return { status: "choose" };
  // An assistant whose chosen MJPM lacks the add-on, while others have it: let them pick again.
  return (await canSeeAgenda()) ? { status: "choose" } : { status: "unavailable" };
}

/** For server actions: the agenda the actor works on, or an error message. */
export async function requireAgendaOwner(): Promise<{ ownerId: string; actorId: string }> {
  const access = await getAgendaAccess();
  if (access.status === "choose") throw new AgendaAccessError("Choisissez d'abord un mandataire.");
  if (access.status !== "ok") throw new AgendaAccessError("Le module Agenda n'est pas activé pour ce compte.");
  return { ownerId: access.ownerId, actorId: access.actorId };
}

/** Sidebar: show « Agenda » when at least one reachable MJPM holds the add-on. */
export async function canSeeAgenda(): Promise<boolean> {
  const { actor, assigned } = await requireActorContext();
  if (!canWorkOnDossiers(actor)) return false;
  return (await ownersWithAgenda(resolveOwnerIds(actor, assigned))).length > 0;
}

/** Errors whose message is safe and useful to show to the user. */
export class AgendaAccessError extends Error {}
