/**
 * Who may work on whose dossiers — pure rules, no I/O (tested in
 * scripts/tests/access-scope.test.ts).
 *
 * - Solo account (no organisation): its own dossiers, exactly as before.
 * - MJPM ("mandataire"): their own dossiers.
 * - Assistant: the dossiers of the MJPMs assigned to them, in the same
 *   organisation, still active. Optionally narrowed to one chosen MJPM.
 * - Organisation member without a working role (e.g. an IT administrator who
 *   only has the admin right): no dossiers at all.
 * The admin right (isOrgAdmin) never grants access to dossiers.
 */

export type OrgRoleValue = "MANDATAIRE" | "ASSISTANT";

export type Actor = {
  id: string;
  orgId: string | null;
  orgRole: OrgRoleValue | null;
  isOrgAdmin: boolean;
};

export type AssignedMandataire = {
  id: string;
  orgId: string | null;
  orgRole: OrgRoleValue | null;
  archived: boolean;
};

/** "all" = every MJPM the assistant handles; otherwise one MJPM's id. */
export type MandataireSelection = "all" | string;

export function isSoloAccount(actor: Actor): boolean {
  return actor.orgId === null;
}

/** Whether the account works on dossiers at all (false for admin-only accounts). */
export function canWorkOnDossiers(actor: Actor): boolean {
  return isSoloAccount(actor) || actor.orgRole !== null;
}

/** The MJPMs an assistant may act for: same organisation, still an MJPM, not archived. */
export function validMandataireIds(actor: Actor, assigned: AssignedMandataire[]): string[] {
  if (actor.orgRole !== "ASSISTANT" || actor.orgId === null) return [];
  return assigned
    .filter((m) => m.orgId === actor.orgId && m.orgRole === "MANDATAIRE" && !m.archived)
    .map((m) => m.id);
}

/**
 * Owner ids whose dossiers the actor may act on. `selection` narrows an
 * assistant's view to one MJPM; an unknown or stale selection falls back to
 * all of them (never to nothing, never to someone not assigned).
 */
export function resolveOwnerIds(
  actor: Actor,
  assigned: AssignedMandataire[],
  selection: MandataireSelection = "all"
): string[] {
  if (isSoloAccount(actor) || actor.orgRole === "MANDATAIRE") return [actor.id];
  if (actor.orgRole !== "ASSISTANT") return [];

  const allowed = validMandataireIds(actor, assigned);
  if (selection !== "all" && allowed.includes(selection)) return [selection];
  return allowed;
}
