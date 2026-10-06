import type { OrgRoleValue } from "@/lib/organizations/rules";

export const ROLE_NONE = "NONE";
export type RoleChoice = OrgRoleValue | typeof ROLE_NONE;

export const ROLE_LABELS: Record<RoleChoice, string> = {
  MANDATAIRE: "Mandataire",
  ASSISTANT: "Assistant(e) tutélaire",
  NONE: "Aucun (administration seulement)",
};

export function toRoleChoice(role: OrgRoleValue | null): RoleChoice {
  return role ?? ROLE_NONE;
}

export function fromRoleChoice(choice: RoleChoice): OrgRoleValue | null {
  return choice === ROLE_NONE ? null : choice;
}
