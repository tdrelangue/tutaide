/**
 * Organisation membership rules — pure, no I/O (tested in
 * scripts/tests/org-rules.test.ts). The service layer (members.ts) checks
 * them before every write and returns the message to the admin.
 */

export type OrgRoleValue = "MANDATAIRE" | "ASSISTANT";

export type MemberState = {
  id: string;
  orgRole: OrgRoleValue | null;
  isOrgAdmin: boolean;
  archived: boolean;
};

export type MemberChange = {
  orgRole?: OrgRoleValue | null;
  isOrgAdmin?: boolean;
  archived?: boolean;
};

function applyChange(member: MemberState, change: MemberChange): MemberState {
  return {
    ...member,
    orgRole: change.orgRole !== undefined ? change.orgRole : member.orgRole,
    isOrgAdmin: change.isOrgAdmin ?? member.isOrgAdmin,
    archived: change.archived ?? member.archived,
  };
}

function activeAdminCount(members: MemberState[]): number {
  return members.filter((m) => m.isOrgAdmin && !m.archived).length;
}

/**
 * Why the change is refused, or null when allowed.
 * - The organisation must always keep at least one active admin.
 * - An MJPM who still owns dossiers keeps the MJPM role (transfer first),
 *   otherwise those dossiers would have nobody responsible for them.
 */
export function refuseMemberChange(
  members: MemberState[],
  memberId: string,
  change: MemberChange,
  ownedDossierCount: number
): string | null {
  const current = members.find((m) => m.id === memberId);
  if (!current) return "Membre introuvable";
  const next = applyChange(current, change);
  const after = members.map((m) => (m.id === memberId ? next : m));

  if (activeAdminCount(members) > 0 && activeAdminCount(after) === 0) {
    return "La structure doit garder au moins un administrateur actif";
  }
  const losesMjpmRole = current.orgRole === "MANDATAIRE" && (next.orgRole !== "MANDATAIRE" || next.archived);
  if (losesMjpmRole && ownedDossierCount > 0) {
    return `Ce mandataire a encore ${ownedDossierCount} dossier(s) : transférez-les d'abord à un autre mandataire`;
  }
  return null;
}

/**
 * The admin right must never turn into dossier access: an organisation admin
 * cannot change their own working role, nor give themselves MJPMs or
 * dossiers. Another admin has to do it (and it is logged).
 */
export function refuseSelfGrant(actorId: string, targetId: string, change: MemberChange = {}): string | null {
  if (actorId !== targetId) return null;
  if (change.orgRole !== undefined) return "Un autre administrateur doit modifier votre propre rôle";
  return "Vous ne pouvez pas vous attribuer vous-même des mandataires ou des dossiers";
}

/** The platform super-administrator is never managed from an organisation. */
export function refuseProtectedAccount(platformRole: "USER" | "ADMIN"): string | null {
  return platformRole === "ADMIN" ? "Ce compte est géré par OrigAI et ne peut pas être modifié ici" : null;
}

/** Assignments are only between an active assistant and an active MJPM of the organisation. */
export function refuseAssignment(assistant: MemberState | undefined, mandataire: MemberState | undefined): string | null {
  if (!assistant || assistant.archived || assistant.orgRole !== "ASSISTANT") return "Assistant(e) invalide";
  if (!mandataire || mandataire.archived || mandataire.orgRole !== "MANDATAIRE") return "Mandataire invalide";
  return null;
}
