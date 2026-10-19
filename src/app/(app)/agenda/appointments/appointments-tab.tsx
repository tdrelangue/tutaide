"use client";

/** « Rendez-vous » tab: appointments to place, planned, done, cancelled. PLACEHOLDER, built in chunk C. */
import type { PersonOption } from "./shared-contracts";

export type AppointmentsTabProps = {
  /** Protected persons that can take part in an appointment. */
  readonly persons: readonly PersonOption[];
};

export function AppointmentsTab({ persons }: AppointmentsTabProps) {
  return <p className="text-sm text-muted-foreground">{persons.length} personne(s). Rendez-vous bientôt disponibles.</p>;
}
