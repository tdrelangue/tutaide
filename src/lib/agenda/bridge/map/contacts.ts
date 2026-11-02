import type { AgendaAvailability, AgendaContact, AgendaPlace } from "@prisma/client";
import type { Availability, Contact, Place, PrefDayRule, VisitPlan } from "../../../agenda-engine/domain";
import { isValidVisitPlan } from "../../../agenda-engine/domain/recurrence";
import { EHPAD_VISIT_FROM, EHPAD_VISIT_TO, findEhpad, livesInEhpad } from "../../ehpad";
import { isIsoDow, toIso } from "../dates";
import { ABSENT, found, groupBy, makeIssue, mapMany, rejected } from "../issues";
import type { Many, Mapped } from "../issues";
import { mapPlaceRow } from "./place";

/** A contact with its own places and availability rows (the caller loads them). */
export interface ContactInput {
  readonly row: AgendaContact;
  readonly places: readonly AgendaPlace[];
  readonly avails: readonly AgendaAvailability[];
}

const MINUTES_PER_DAY = 1440;

function mapPlaces(row: AgendaContact, places: readonly AgendaPlace[]): Many<Place> {
  const ordered = [...places].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  const mapped = mapMany(ordered, (place) => mapPlaceRow(place, "contact", place.id));
  // The default address (position 0) is unusable: the contact has NO address (the engine says so) —
  // never fall back on a secondary address, the MJPM would visit the wrong place.
  const first = ordered[0];
  const firstUsable = first === undefined || first.position !== 0 || mapped.values.some((p) => p.id === first.id);
  return firstUsable ? mapped : { values: [], issues: mapped.issues };
}

function toAvailability(row: AgendaAvailability): Availability | null {
  const dows = [...new Set(row.dows)].filter(isIsoDow);
  const valid = dows.length > 0 && row.fromMin >= 0 && row.fromMin < row.toMin && row.toMin <= MINUTES_PER_DAY;
  return valid ? { dows, from: row.fromMin, to: row.toMin } : null;
}

/** No rows = null (available whenever working). Rows that are all unusable give [] (never), not null. */
function mapAvail(contactId: string, rows: readonly AgendaAvailability[]): Mapped<readonly Availability[]> {
  if (rows.length === 0) return ABSENT;
  const results = rows.map(toAvailability);
  const issues = results.flatMap((r) => (r === null ? [makeIssue("contact", contactId, "BAD_AVAILABILITY")] : []));
  return found(
    results.flatMap((r) => (r === null ? [] : [r])),
    issues,
  );
}

function mapVisits(row: AgendaContact, today: string): Mapped<VisitPlan> {
  const { visitsPerPeriod: count, visitPeriod: period } = row;
  if (count === null && period === null) return ABSENT;
  if (count === null || period === null) return rejected([makeIssue("contact", row.id, "VISITS_INCOMPLETE")]);
  const plan: VisitPlan = {
    count,
    period,
    ...(row.visitEvery !== null && row.visitEvery !== 1 ? { every: row.visitEvery } : {}),
    lastVisit: row.lastVisitOn ? toIso(row.lastVisitOn) : today,
    priority: row.visitPriority ?? "NORMAL",
    minutes: row.visitMin,
  };
  if (!isValidVisitPlan(plan)) return rejected([makeIssue("contact", row.id, "VISITS_INVALID")]);
  if (row.lastVisitOn) return found(plan);
  // Unknown last visit: the person is followed from the day they were added (never later than
  // today); the first visit is spread over the interval that follows, without urgency.
  const added = toIso(row.createdAt);
  const startedOn = added < today ? added : today;
  return found({ ...plan, lastVisit: startedOn, startedOn }, [makeIssue("contact", row.id, "LAST_VISIT_UNKNOWN")]);
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** EHPAD mornings are for care: every window is cut to the afternoon (none left = never). */
function afternoonOnly(avail: readonly Availability[] | null): readonly Availability[] {
  const windows = avail ?? [{ dows: ALL_DAYS, from: 0, to: MINUTES_PER_DAY }];
  return windows.flatMap((w) => {
    const from = Math.max(w.from, EHPAD_VISIT_FROM);
    const to = Math.min(w.to, EHPAD_VISIT_TO);
    return from < to ? [{ ...w, from, to }] : [];
  });
}

/**
 * Resident of an EHPAD (the checkbox, or the address when it was not ticked
 * either way): their home place carries the EHPAD as `site`, so the visits of
 * one establishment are grouped, and they are seen in the afternoon only.
 */
function withEhpad(row: AgendaContact, places: readonly Place[], avail: readonly Availability[] | null) {
  const home = places[0];
  const point = home ? { lat: home.lat, lon: home.lon } : null;
  if (!livesInEhpad(row.inEhpad, home?.address ?? null, point)) return { places, avail };
  if (!home || !point) return { places, avail: afternoonOnly(avail) };
  const ehpad = findEhpad(home.address, point);
  const site = ehpad?.id ?? `point:${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
  return { places: [{ ...home, site }, ...places.slice(1)], avail: afternoonOnly(avail) };
}

function mapPrefDay(row: AgendaContact): Mapped<PrefDayRule> {
  const { prefDayDow: dow, prefDayStrength: strength } = row;
  if (dow === null && strength === null) return ABSENT;
  if (!isIsoDow(dow) || strength === null) return rejected([makeIssue("contact", row.id, "PREF_DAY_INVALID")]);
  return found({
    id: `pref:${row.id}`,
    type: "PREF_DAY",
    dow,
    strength,
    label: `Jour préféré de ${row.fullName}`,
  });
}

/** Always yields a contact; what could not be used is reported in the issues. */
export function mapContact(input: ContactInput, today: string): Mapped<Contact> {
  const { row } = input;
  const places = mapPlaces(row, input.places);
  const avail = mapAvail(row.id, input.avails);
  const visits = mapVisits(row, today);
  const prefDay = mapPrefDay(row);
  const ehpad = row.category === "PROTEGE" ? withEhpad(row, places.values, avail.value) : { places: places.values, avail: avail.value };
  return found(
    {
      id: row.id,
      name: row.fullName,
      category: row.category,
      places: ehpad.places,
      avail: ehpad.avail,
      notBefore: row.notBeforeMin,
      status: row.status,
      visits: visits.value,
      prefDay: prefDay.value,
    },
    [...places.issues, ...avail.issues, ...visits.issues, ...prefDay.issues],
  );
}

/** Places and availability are grouped per contact; free places (no contact) are ignored. */
export function mapContacts(
  rows: readonly AgendaContact[],
  places: readonly AgendaPlace[],
  avails: readonly AgendaAvailability[],
  today: string,
): Many<Contact> {
  const placesBy = groupBy(places, (p) => p.contactId);
  const availsBy = groupBy(avails, (a) => a.contactId);
  return mapMany(rows, (row) =>
    mapContact({ row, places: placesBy.get(row.id) ?? [], avails: availsBy.get(row.id) ?? [] }, today),
  );
}
