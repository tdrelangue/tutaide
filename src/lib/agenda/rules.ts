/**
 * « Agenda » add-on — pure rules, no I/O (tested in scripts/tests/agenda-rules.test.ts).
 */

export type AgendaPeriodValue = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export type AgendaEndReasonValue = "DECES" | "DESSAISISSEMENT" | "MAINLEVEE" | "TRANSFERT" | "AUTRE";

export const PERIOD_LABELS: Record<AgendaPeriodValue, { singular: string; plural: string; per: string; every: string }> = {
  WEEK: { singular: "semaine", plural: "semaines", per: "par semaine", every: "Toutes les" },
  MONTH: { singular: "mois", plural: "mois", per: "par mois", every: "Tous les" },
  QUARTER: { singular: "trimestre", plural: "trimestres", per: "par trimestre", every: "Tous les" },
  YEAR: { singular: "an", plural: "ans", per: "par an", every: "Tous les" },
};

/** Average days per period, as the planner counts them. */
const PERIOD_DAYS: Record<AgendaPeriodValue, number> = { WEEK: 7, MONTH: 30.4, QUARTER: 91.3, YEAR: 365 };

export const END_REASON_LABELS: Record<AgendaEndReasonValue, string> = {
  DECES: "Décès",
  DESSAISISSEMENT: "Dessaisissement",
  MAINLEVEE: "Mainlevée",
  TRANSFERT: "Transfert à un autre mandataire",
  AUTRE: "Autre fin de mesure",
};

/** "Tous les trimestres", "Toutes les 2 semaines"; older plans: "2 visites par mois". */
export function formatFrequency(count: number, period: AgendaPeriodValue, every = 1): string {
  const label = PERIOD_LABELS[period];
  if (count > 1) {
    const per = every === 1 ? label.per : `${label.every.toLowerCase()} ${every} ${label.plural}`;
    return `${count} visites ${per}`;
  }
  return every === 1 ? `${label.every} ${label.plural}` : `${label.every} ${every} ${label.plural}`;
}

/**
 * The form asks « tous les N <unité> »: an older « 2 visites par mois » is shown
 * as the same rhythm in weeks or months (2 par mois -> toutes les 2 semaines).
 */
export function toEveryForm(count: number, period: AgendaPeriodValue, every: number): { every: number; period: AgendaPeriodValue } {
  if (count <= 1) return { every, period };
  const days = (PERIOD_DAYS[period] * every) / count;
  const months = days / PERIOD_DAYS.MONTH;
  if (months >= 1 && Math.abs(months - Math.round(months)) < 0.05) return { every: Math.round(months), period: "MONTH" };
  return { every: Math.max(1, Math.round(days / 7)), period: "WEEK" };
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
