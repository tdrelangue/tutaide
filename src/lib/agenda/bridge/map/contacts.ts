import type { AgendaAvailability, AgendaContact, AgendaPlace } from "@prisma/client";
import { addDays, intervalDays } from "../../../agenda-engine/domain";
import type { Availability, Contact, Place, PrefDayRule, VisitPlan } from "../../../agenda-engine/domain";
import { isValidVisitPlan } from "../../../agenda-engine/domain/recurrence";
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
    lastVisit: row.lastVisitOn ? toIso(row.lastVisitOn) : today,
    priority: row.visitPriority ?? "NORMAL",
    minutes: row.visitMin,
  };
  if (!isValidVisitPlan(plan)) return rejected([makeIssue("contact", row.id, "VISITS_INVALID")]);
  if (row.lastVisitOn) return found(plan);
  // Unknown last visit: made up so that the visit is due today (one interval later).
  const lastVisit = addDays(today, -intervalDays(plan));
  return found({ ...plan, lastVisit }, [makeIssue("contact", row.id, "LAST_VISIT_UNKNOWN")]);
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
  return found(
    {
      id: row.id,
      name: row.fullName,
      category: row.category,
      places: places.values,
      avail: avail.value,
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
