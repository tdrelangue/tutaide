/**
 * « Nouveau rendez-vous » form: values, checks and conversion to the
 * addAppointment input (lib/agenda/appointments.ts appointmentSchema). Pure.
 */
import type { AppointmentInput } from "@/lib/agenda/appointments";
import type { Place } from "@/lib/agenda/service";
import { timeToMinutes } from "@/lib/agenda/rules";
import type { IsoDate, PriorityValue } from "@/lib/agenda/views/types";
import { addDays, formatDayShort, mondayOf, parseIso } from "./format";

export type WhenKind = "FIXED" | "WEEK" | "RANGE";
/** « Chez moi » is gone: almost never used (Thomas, 2026-11-02). */
export type PlaceKind = "OFFICE" | "PERSON" | "PARTNER" | "OUTSIDE" | "VISIO";

export type FormValues = {
  readonly title: string;
  /** Persons to visit taking part. */
  readonly participantIds: readonly string[];
  /** Contacts of the shared address book taking part (lawyer, notary…). */
  readonly partnerIds: readonly string[];
  readonly place: PlaceKind;
  /** « Chez le majeur protégé »: which participant (null = the first one ticked). */
  readonly placePersonId: string | null;
  /** « Au cabinet d'un contact »: which contact (null = the first one chosen). */
  readonly placePartnerId: string | null;
  /** « À l'extérieur »: what the place is (« Cabinet du notaire »…) and its address. */
  readonly outsideLabel: string;
  readonly outsideAddress: Place | null;
  readonly durationMin: number;
  readonly whenKind: WhenKind;
  readonly date: IsoDate;
  readonly time: string;
  /** Monday of the chosen week. */
  readonly weekOf: IsoDate;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly priority: PriorityValue;
};

export const SELECT_CLASS =
  "flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export type FieldKey = "title" | "place" | "date" | "time" | "from" | "to";
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Shared by the field groups of the form. */
export type FieldProps = {
  readonly values: FormValues;
  readonly update: (patch: Partial<FormValues>) => void;
  readonly errors: FieldErrors;
  readonly register: (key: FieldKey) => (element: HTMLInputElement | null) => void;
};

/** Order in which the first error gets the focus. */
export const FIELD_ORDER: readonly FieldKey[] = ["title", "place", "date", "time", "from", "to"];

export const PLACE_CHOICES: readonly { value: PlaceKind; label: string }[] = [
  { value: "OFFICE", label: "Au bureau" },
  { value: "PERSON", label: "Chez le majeur protégé" },
  { value: "PARTNER", label: "Au cabinet d'un contact" },
  { value: "OUTSIDE", label: "À l'extérieur (à préciser)" },
  { value: "VISIO", label: "En visio" },
];

export const WHEN_CHOICES: readonly { value: WhenKind; label: string }[] = [
  { value: "FIXED", label: "À heure fixe" },
  { value: "WEEK", label: "Dans la semaine du…" },
  { value: "RANGE", label: "Entre deux dates" },
];

const WEEKS_OFFERED = 16;
const RANGE_DEFAULT_DAYS = 14;
const MAX_WINDOW_DAYS = 366;
const LAST_START = 24 * 60 - 5;
const DAY_MS = 86_400_000;

export function initialValues(today: IsoDate, participantIds: readonly string[]): FormValues {
  return {
    title: "",
    participantIds,
    partnerIds: [],
    place: "OFFICE",
    placePersonId: null,
    placePartnerId: null,
    outsideLabel: "",
    outsideAddress: null,
    durationMin: 30,
    whenKind: "WEEK",
    date: today,
    time: "09:00",
    weekOf: addDays(mondayOf(today), 7),
    from: today,
    to: addDays(today, RANGE_DEFAULT_DAYS),
    priority: "NORMAL",
  };
}

/** « Modifier le rendez-vous »: the stored appointment as the form's values (pure). */
export function valuesFromInput(input: AppointmentInput, today: IsoDate): FormValues {
  const base = initialValues(today, input.participantIds);
  const { place, when } = input;
  const fixed = when.kind === "FIXED";
  return {
    ...base,
    title: input.title,
    partnerIds: input.partnerIds ?? [],
    place: place.kind === "PLACE" || place.kind === "HOME" ? "OFFICE" : place.kind,
    placePersonId: place.kind === "PERSON" ? place.personId : null,
    placePartnerId: place.kind === "PARTNER" ? place.partnerId : null,
    outsideLabel: place.kind === "OUTSIDE" ? place.label : "",
    outsideAddress: place.kind === "OUTSIDE" ? place.address : null,
    durationMin: input.durationMin,
    whenKind: when.kind,
    date: fixed ? when.date : base.date,
    time: fixed ? minutesToTime(when.timeMin) : base.time,
    weekOf: when.kind === "WEEK" ? mondayOf(when.from) : base.weekOf,
    from: fixed ? base.from : when.from,
    to: fixed ? base.to : when.to,
    priority: input.priority,
  };
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The weeks offered by « Dans la semaine du… »: this one and the next ones, Monday to Friday. */
export function weekOptions(today: IsoDate): readonly { value: IsoDate; label: string }[] {
  const first = mondayOf(today);
  return Array.from({ length: WEEKS_OFFERED }, (_, i) => {
    const monday = addDays(first, i * 7);
    return { value: monday, label: `du ${formatDayShort(monday)} au ${formatDayShort(addDays(monday, 4))}` };
  });
}

function checkWhen(values: FormValues): FieldErrors {
  if (values.whenKind === "WEEK") return {};
  if (values.whenKind === "FIXED") {
    const errors: FieldErrors = {};
    if (values.date === "") errors.date = "Indiquez la date du rendez-vous.";
    const minutes = timeToMinutes(values.time);
    if (minutes === null || minutes > LAST_START) errors.time = "Indiquez l'heure du rendez-vous.";
    return errors;
  }
  if (values.from === "") return { from: "Indiquez la première date possible." };
  if (values.to === "") return { to: "Indiquez la dernière date possible." };
  const days = (parseIso(values.to).getTime() - parseIso(values.from).getTime()) / DAY_MS;
  if (days < 0) return { to: "La dernière date doit suivre la première." };
  if (days > MAX_WINDOW_DAYS) return { to: "La période ne peut pas dépasser un an." };
  return {};
}

/** The participant whose address is the place of « Chez le majeur protégé ». */
export function placePerson(values: FormValues): string | null {
  const chosen = values.placePersonId;
  if (chosen !== null && values.participantIds.includes(chosen)) return chosen;
  return values.participantIds[0] ?? null;
}

/** The contact whose address is the place of « Au cabinet d'un contact ». */
export function placePartner(values: FormValues): string | null {
  const chosen = values.placePartnerId;
  if (chosen !== null && values.partnerIds.includes(chosen)) return chosen;
  return values.partnerIds[0] ?? null;
}

function checkPlace(values: FormValues): FieldErrors {
  if (values.place === "PERSON" && placePerson(values) === null) return { place: "Choisissez la personne chez qui a lieu le rendez-vous." };
  if (values.place === "PARTNER" && placePartner(values) === null) return { place: "Choisissez le contact dans « Avec qui ? » : son adresse sera le lieu." };
  if (values.place === "OUTSIDE" && values.outsideAddress === null) return { place: "Indiquez l'adresse du rendez-vous." };
  return {};
}

/** Same rules as the server, with messages next to each field. */
export function checkValues(values: FormValues): FieldErrors {
  const errors: FieldErrors = values.title.trim().length < 2 ? { title: "Indiquez l'objet du rendez-vous." } : {};
  return { ...errors, ...checkPlace(values), ...checkWhen(values) };
}

function placeInput(values: FormValues): AppointmentInput["place"] {
  const person = placePerson(values);
  if (values.place === "PERSON" && person !== null) return { kind: "PERSON", personId: person };
  const partner = placePartner(values);
  if (values.place === "PARTNER" && partner !== null) return { kind: "PARTNER", partnerId: partner };
  if (values.place === "OUTSIDE" && values.outsideAddress !== null) {
    return { kind: "OUTSIDE", label: values.outsideLabel.trim(), address: values.outsideAddress };
  }
  return { kind: values.place === "VISIO" ? "VISIO" : "OFFICE" };
}

function whenInput(values: FormValues): AppointmentInput["when"] {
  if (values.whenKind === "FIXED") return { kind: "FIXED", date: values.date, timeMin: timeToMinutes(values.time) ?? 0 };
  if (values.whenKind === "WEEK") return { kind: "WEEK", from: values.weekOf, to: addDays(values.weekOf, 4) };
  return { kind: "RANGE", from: values.from, to: values.to };
}

/** Call only once checkValues returned no error. */
export function toInput(values: FormValues): AppointmentInput {
  return {
    title: values.title.trim(),
    participantIds: [...values.participantIds],
    partnerIds: [...values.partnerIds],
    place: placeInput(values),
    durationMin: values.durationMin,
    when: whenInput(values),
    // Fixed time: validated at once, its priority only matters if it must move one day.
    priority: values.whenKind === "FIXED" ? "NORMAL" : values.priority,
  };
}
