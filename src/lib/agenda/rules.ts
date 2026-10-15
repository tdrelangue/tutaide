/**
 * « Agenda » add-on — pure rules, no I/O (tested in scripts/tests/agenda-rules.test.ts).
 */

export type AgendaPeriodValue = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export type AgendaEndReasonValue = "DECES" | "DESSAISISSEMENT" | "MAINLEVEE" | "TRANSFERT" | "AUTRE";

export const PERIOD_LABELS: Record<AgendaPeriodValue, { singular: string; per: string }> = {
  WEEK: { singular: "semaine", per: "par semaine" },
  MONTH: { singular: "mois", per: "par mois" },
  QUARTER: { singular: "trimestre", per: "par trimestre" },
  YEAR: { singular: "an", per: "par an" },
};

export const END_REASON_LABELS: Record<AgendaEndReasonValue, string> = {
  DECES: "Décès",
  DESSAISISSEMENT: "Dessaisissement",
  MAINLEVEE: "Mainlevée",
  TRANSFERT: "Transfert à un autre mandataire",
  AUTRE: "Autre fin de mesure",
};

/** "1 visite par trimestre", "2 visites par mois". */
export function formatFrequency(count: number, period: AgendaPeriodValue): string {
  return `${count} visite${count > 1 ? "s" : ""} ${PERIOD_LABELS[period].per}`;
}

/** 90 -> "1 h 30", 45 -> "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** 540 -> "09:00" (value of an <input type="time">). */
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "09:00" -> 540; null when not a valid time. */
export function timeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * Whether an MJPM's account holds the add-on. Today: granted by OrigAI's
 * admin, or the demo. The Stripe add-on (phase 5) will be a third source.
 */
export function hasAgendaAccess(owner: { agendaGranted: boolean }, isDemo: boolean): boolean {
  return isDemo || owner.agendaGranted;
}

/** The agenda is one MJPM's: an assistant handling several must choose one first. */
export type AgendaOwnerPick = { kind: "owner"; ownerId: string } | { kind: "choose" } | { kind: "none" };

export function pickAgendaOwner(ownerIds: string[]): AgendaOwnerPick {
  if (ownerIds.length === 1) return { kind: "owner", ownerId: ownerIds[0] };
  return ownerIds.length === 0 ? { kind: "none" } : { kind: "choose" };
}

// ---------------------------------------------------------------------------
// Persons from dossiers
// ---------------------------------------------------------------------------

export type DossierRow = { id: string; fullName: string; groupId: string | null; createdAt: Date };
export type DossierPerson = { dossierGroupKey: string; fullName: string; dossierCount: number };

/** A person's dossiers share a groupId (APA + ASH + PCH); a lone dossier is its own group. */
export function dossierGroupKey(dossier: { id: string; groupId: string | null }): string {
  return dossier.groupId ?? dossier.id;
}

/**
 * One entry per protected person found in the (active) dossiers, skipping
 * those already in the agenda. Name = the oldest dossier's name.
 */
export function personsFromDossiers(dossiers: DossierRow[], existingKeys: Set<string>): DossierPerson[] {
  const groups = new Map<string, DossierRow[]>();
  for (const dossier of dossiers) {
    const key = dossierGroupKey(dossier);
    if (existingKeys.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), dossier]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const oldest = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      return { dossierGroupKey: key, fullName: oldest.fullName, dossierCount: rows.length };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
}
