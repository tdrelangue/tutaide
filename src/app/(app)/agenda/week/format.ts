import type {
  EntrySource,
  EntryView,
  IsoDate,
  Minutes,
  PinWarningValue,
  PriorityValue,
  StrengthValue,
  UnplacedReasonValue,
} from "@/lib/agenda/views/types";

/**
 * Pure French formatting for the « Planning » tab. Dates are "YYYY-MM-DD"
 * handled at UTC noon, so no timezone or daylight-saving shift can move a day.
 */

const DAY_MS = 86_400_000;

function toDate(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** 1050 -> "17 h 30", 540 -> "9 h". */
export function hm(minutes: Minutes): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function timeRange(start: Minutes, end: Minutes): string {
  return `${hm(start)} – ${hm(end)}`;
}

export function km(value: number): string {
  return `${Math.round(value)} km`;
}

/** plural(1, "visite", "visites") -> "1 visite". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return new Date(toDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week holding `iso`. */
export function mondayOf(iso: IsoDate): IsoDate {
  const weekday = toDate(iso).getUTCDay();
  return addDays(iso, -((weekday + 6) % 7));
}

/** Only for the very first request: afterwards « today » comes from the server (WeekView.today). */
export function localToday(): IsoDate {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** "1er", "19". */
function dayNumber(iso: IsoDate): string {
  const n = toDate(iso).getUTCDate();
  return n === 1 ? "1er" : String(n);
}

function dayMonth(iso: IsoDate, withYear: boolean): string {
  const text = `${dayNumber(iso)} ${MONTH.format(toDate(iso))}`;
  return withYear ? `${text} ${iso.slice(0, 4)}` : text;
}

/** « Semaine du 19 au 25 octobre », « Semaine du 28 septembre au 4 octobre ». */
export function weekLabel(from: IsoDate, to: IsoDate): string {
  const crossesYear = from.slice(0, 4) !== to.slice(0, 4);
  if (!crossesYear && from.slice(0, 7) === to.slice(0, 7)) return `Semaine du ${dayNumber(from)} au ${dayMonth(to, false)}`;
  return `Semaine du ${dayMonth(from, crossesYear)} au ${dayMonth(to, crossesYear)}`;
}

/** "lun. 19", for narrow columns. */
export function dayShort(iso: IsoDate): string {
  return SHORT.format(toDate(iso));
}

export const PRIORITY_LABEL: Readonly<Record<PriorityValue, string>> = {
  LOW: "Basse",
  NORMAL: "Normale",
  HIGH: "Haute",
  MUST: "Incontournable",
};

export const STRENGTH_LABEL: Readonly<Record<StrengthValue, string>> = {
  HARD: "Impératif",
  STRONG: "Important",
  MEDIUM: "Souhaité",
  SOFT: "Si possible",
};

/** The word that tells each state (never colour alone). */
export const SOURCE_WORD: Readonly<Record<EntrySource, string>> = {
  PROPOSED: "Proposé",
  PINNED: "Placé à la main",
  VALIDATED: "Validé",
  FIXED: "Heure fixe",
  DONE: "Vu",
  MISSED: "N'a pas eu lieu",
  BUSY: "Indisponible",
  LUNCH: "Pause déjeuner",
};

export const WARNING_LABEL: Readonly<Record<PinWarningValue, string>> = {
  CLOSED_DAY: "Jour fermé (repos, vacances…)",
  OVERLAP: "Chevauche un autre rendez-vous",
  LUNCH: "Pendant la pause déjeuner",
  PAST_LIMIT: "Dépasse votre limite stricte de fin de journée",
  UNAVAILABLE: "Un participant n'est pas disponible à cette heure",
  LATE: "Impossible d'enchaîner à l'heure avec les autres rendez-vous",
};

export const REASON_LABEL: Readonly<Record<UnplacedReasonValue | "LATE", string>> = {
  NO_COMMON_SLOT: "aucun créneau commun entre vos disponibilités et celles des participants",
  NO_FREE_DAY: "aucune journée libre avant la date limite",
  UNKNOWN_PLACE: "le lieu n'existe plus",
  NO_ADDRESS: "la personne n'a pas d'adresse",
  INVALID_FREQUENCY: "la fréquence des visites n'est pas valable",
  LATE: "placé après la date prévue",
};

/** Full accessible name of a card: title, when, state, priority, warnings. */
export function entryAccessibleName(entry: EntryView, dayLabel: string): string {
  return [
    entry.title,
    `${dayLabel}, de ${hm(entry.start)} à ${hm(entry.end)}`,
    SOURCE_WORD[entry.source],
    entry.priority ? `priorité ${PRIORITY_LABEL[entry.priority]}` : null,
    entry.moved ? "décalé" : null,
    entry.rescheduled ? "à reprogrammer" : null,
    entry.warning ? `attention : ${WARNING_LABEL[entry.warning]}` : null,
    entry.subtitle,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");
}
