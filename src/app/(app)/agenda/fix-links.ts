/**
 * Where an agenda issue is fixed (IssueView.fixTab). The agenda's settings
 * live in the app's Paramètres page (tab « Agenda »), not in the module.
 */
const FIX_TARGETS: Readonly<Record<string, { readonly href: string; readonly label: string }>> = {
  parametres: { href: "/settings?tab=agenda", label: "Paramètres › Agenda" },
  personnes: { href: "/agenda?tab=personnes", label: "Personnes à visiter" },
  "rendez-vous": { href: "/agenda?tab=rendez-vous", label: "Rendez-vous" },
  planning: { href: "/agenda?tab=planning", label: "Planning" },
};

export function fixTarget(fixTab: string | null): { readonly href: string; readonly label: string } | null {
  return fixTab === null ? null : (FIX_TARGETS[fixTab] ?? null);
}

/** The agenda settings page, from anywhere in the module. */
export const AGENDA_SETTINGS_HREF = "/settings?tab=agenda";
