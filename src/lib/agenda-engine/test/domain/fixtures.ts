// Fictional test data around Brive-la-Gaillarde: pun names only, never real people.
import type {
  Appointment,
  Availability,
  Contact,
  ContactCategory,
  IsoDate,
  IsoDow,
  Minutes,
  Period,
  Place,
  PlannerState,
  PrefDayRule,
  Priority,
  Settings,
  ValidatedItem,
  When,
} from "../../domain/model";

export const H = (h: number, m = 0): Minutes => h * 60 + m;
export const WEEKDAYS: readonly IsoDow[] = [1, 2, 3, 4, 5];

/** Monday 19 October 2026: the start of most test periods. */
export const MON = "2026-10-19";
export const FRI = "2026-10-23";
export const SUN4 = "2026-11-15";

export function place(id: string, lat: number, lon: number, label = id): Place {
  return { id, label, address: `${label}, Corrèze`, lat, lon };
}

export const HOME = place("home", 45.1588, 1.5321, "Domicile");
export const OFFICE = place("office", 45.1612, 1.5296, "Bureau");
export const MALEMORT = place("malemort", 45.17, 1.5636);
export const TULLE = place("tulle", 45.2675, 1.7716);
export const OBJAT = place("objat", 45.2626, 1.4083);
export const USSEL = place("ussel", 45.5481, 2.3097);
export const ALLASSAC = place("allassac", 45.2582, 1.4752);

export function settings(over: Partial<Settings> = {}): Settings {
  return {
    home: HOME,
    office: OFFICE,
    workDays: WEEKDAYS,
    dayStart: H(8, 30),
    dayEnd: H(18, 30),
    dayEndLimit: null,
    lunch: [H(12, 30), H(13, 30)],
    visitMinutes: 60,
    ...over,
  };
}

interface ProtegeOptions {
  readonly at: Place;
  readonly last: IsoDate;
  readonly count?: number;
  readonly period?: Period;
  readonly priority?: Priority;
  readonly prefDay?: PrefDayRule;
  readonly notBefore?: Minutes;
  readonly status?: Contact["status"];
  readonly minutes?: number;
}

export function protege(id: string, name: string, o: ProtegeOptions): Contact {
  return {
    id,
    name,
    category: "PROTEGE",
    places: [{ ...o.at, id: `${id}-home`, label: `Domicile de ${name}` }],
    avail: null,
    notBefore: o.notBefore ?? null,
    status: o.status ?? "ACTIVE",
    visits: {
      count: o.count ?? 1,
      period: o.period ?? "MONTH",
      lastVisit: o.last,
      priority: o.priority ?? "LOW",
      minutes: o.minutes ?? null,
    },
    prefDay: o.prefDay ?? null,
  };
}

export function contact(
  id: string,
  name: string,
  category: ContactCategory,
  places: readonly Place[],
  avail: readonly Availability[] | null = null,
): Contact {
  return {
    id,
    name,
    category,
    places,
    avail,
    notBefore: null,
    status: "ACTIVE",
    visits: null,
    prefDay: null,
  };
}

export function appt(
  id: string,
  when: When,
  o: {
    participants?: readonly string[];
    placeId?: string;
    dur?: number;
    priority?: Priority;
  } = {},
): Appointment {
  return {
    id,
    title: `Rendez-vous ${id}`,
    participants: o.participants ?? [],
    placeId: o.placeId ?? "office",
    dur: o.dur ?? 60,
    when,
    priority: o.priority ?? "NORMAL",
  };
}

export function validatedItem(
  id: string,
  date: IsoDate,
  start: Minutes,
  o: Partial<ValidatedItem> = {},
): ValidatedItem {
  const dur = o.dur ?? 60;
  return {
    id,
    apptId: null,
    kind: "VISIT",
    title: `Visite ${id}`,
    participants: [],
    personId: null,
    place: MALEMORT,
    dur,
    date,
    start,
    end: start + dur,
    priority: "LOW",
    earliest: date,
    latest: date,
    fixed: false,
    movable: false,
    moved: false,
    ...o,
  };
}

/** The day the state is seen from, unless a test says otherwise. */
export const TODAY = "2026-10-14";

export function state(over: Partial<PlannerState> = {}): PlannerState {
  return {
    today: TODAY,
    settings: settings(),
    places: [],
    rules: [],
    contacts: [],
    appointments: [],
    validated: [],
    past: [],
    skips: [],
    priorityOverrides: {},
    answers: {},
    refusedExceptions: [],
    pins: [],
    ...over,
  };
}
