"use client";

import type { PersonOption } from "../appointments/shared-contracts";

/** « Planning » tab: the week grid (validated plan + proposal). PLACEHOLDER, built in chunk B. */
export type WeekTabProps = {
  /** No home address yet: the tab explains what to fill in instead of planning. */
  readonly needsSetup: boolean;
  /** For « Nouveau rendez-vous » (participants). */
  readonly persons: readonly PersonOption[];
};

export function WeekTab({ needsSetup, persons }: WeekTabProps) {
  return <p className="text-sm text-muted-foreground">{needsSetup ? "Indiquez d'abord votre domicile." : `Planning bientôt disponible (${persons.length} personne(s)).`}</p>;
}
