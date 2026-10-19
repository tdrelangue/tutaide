/**
 * French labels for the « Rendez-vous » screens. Pure functions.
 * "YYYY-MM-DD" is read as UTC midnight and formatted in UTC, so a date never
 * shifts by a day whatever the computer's timezone.
 */
import type { AppointmentStatus, IsoDate, ItemRef, Minutes, PriorityValue, SlotView, WhenView } from "@/lib/agenda/views/types";

const DAY_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const DAY_SHORT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const DAY_PLAIN = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DAY_MS = 86_400_000;

export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(date).getTime() + days * DAY_MS));
}

/** Monday of the week holding `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  const weekday = (parseIso(date).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** Today in the computer's own calendar (a default for the form only, never a rule). */
export function localToday(): IsoDate {
  const now = new Date();
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Mardi 21 oct." */
export function formatDayLong(date: IsoDate): string {
  return capitalize(DAY_LONG.format(parseIso(date)));
}

/** "mar. 21 oct." */
export function formatDayShort(date: IsoDate): string {
  return DAY_SHORT.format(parseIso(date));
}

/** "21 oct. 2026" */
export function formatDayPlain(date: IsoDate): string {
  return DAY_PLAIN.format(parseIso(date));
}

/** 840 -> "14 h 00" */
export function formatTime(minutes: Minutes): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** "mar. 21 oct., 14 h 00 – 15 h 00" */
export function formatSlot(slot: SlotView): string {
  return `${formatDayShort(slot.date)}, ${formatTime(slot.start)} – ${formatTime(slot.end)}`;
}

/** "mar. 21 oct. 14 h 00 · Visite Jean Bonneau" */
export function formatItem(item: ItemRef): string {
  return `${formatDayShort(item.date)} ${formatTime(item.start)} · ${item.title}`;
}

export function formatWhen(when: WhenView): string {
  if (when.kind === "FIXED") return `${formatDayLong(when.date)} à ${formatTime(when.timeMin)}`;
  if (when.kind === "WEEK") return `Semaine du ${formatDayPlain(when.from)}`;
  return `Entre le ${formatDayPlain(when.from)} et le ${formatDayPlain(when.to)}`;
}

export const PRIORITY_LABELS: Record<PriorityValue, { label: string; hint: string }> = {
  LOW: { label: "Basse", hint: "Peut être reporté sans vous déranger s'il n'y a pas de place." },
  NORMAL: { label: "Normale", hint: "Placé dès que possible dans la période choisie." },
  HIGH: { label: "Haute", hint: "Passe avant les rendez-vous de priorité basse ou normale." },
  MUST: { label: "Incontournable", hint: "Doit avoir lieu : une alerte s'affiche s'il ne peut pas être placé." },
};

export const PRIORITY_CLASS: Record<PriorityValue, string> = {
  LOW: "border-transparent bg-muted text-muted-foreground",
  NORMAL: "border-border bg-background text-foreground",
  HIGH: "border-transparent bg-agenda-warn-soft text-agenda-warn",
  MUST: "border-agenda-warn bg-agenda-warn-soft text-agenda-warn",
};

/** A fixed-time appointment is not « placed » by Tutellia: it waits for the week's validation. */
export function statusLabel(row: { readonly status: AppointmentStatus; readonly when: { readonly kind: string } }): string {
  return row.status === "A_PLACER" && row.when.kind === "FIXED" ? "Heure fixe · à valider" : STATUS_LABELS[row.status];
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  A_PLACER: "À placer",
  PREVU: "Prévu",
  FAIT: "Passé",
  ANNULE: "Annulé",
};

export const STATUS_CLASS: Record<AppointmentStatus, string> = {
  A_PLACER: "border-agenda-warn bg-agenda-warn-soft text-agenda-warn",
  PREVU: "border-transparent bg-agenda-held-soft text-agenda-held",
  FAIT: "border-transparent bg-muted text-muted-foreground",
  ANNULE: "border-agenda-missed bg-background text-agenda-missed line-through",
};
