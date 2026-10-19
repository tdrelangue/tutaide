import { db } from "@/lib/db";
import type { PlannerState } from "@/lib/agenda-engine/domain";
import { todayIn } from "./dates";
import { makeIssue } from "./issues";
import type { BridgeIssue } from "./issues";
import {
  mapAnswers,
  mapAppointments,
  mapContacts,
  mapFreePlaces,
  mapItems,
  mapOverrides,
  mapPins,
  mapRules,
  mapSettings,
} from "./map";

/** Default zone when the MJPM has no settings yet. */
const DEFAULT_TIMEZONE = "Europe/Paris";

export type LoadedAgenda =
  | {
      readonly ok: true;
      readonly state: PlannerState;
      /** Version of the settings row the state was read at: planning writes are refused if it moved (see lock.ts). */
      readonly version: number;
      readonly issues: readonly BridgeIssue[];
    }
  /** Nothing can be planned yet (e.g. no home address): `issues` says why. */
  | { readonly ok: false; readonly today: string; readonly issues: readonly BridgeIssue[] };

/** Every agenda row of one owner, in parallel. Every query is scoped by ownerId. */
async function readRows(ownerId: string) {
  const participants = { select: { contactId: true } } as const;
  const [settings, contacts, places, avails, rules, appointments, items, pins, answers, overrides] = await Promise.all([
    db.agendaSettings.findUnique({ where: { ownerId } }),
    db.agendaContact.findMany({ where: { ownerId } }),
    db.agendaPlace.findMany({ where: { ownerId } }),
    db.agendaAvailability.findMany({ where: { contact: { ownerId } } }),
    db.agendaRule.findMany({ where: { ownerId } }),
    db.agendaAppointment.findMany({ where: { ownerId }, include: { participants } }),
    db.agendaItem.findMany({ where: { ownerId, status: { in: ["VALIDATED", "MISSED"] } }, include: { participants } }),
    db.agendaPin.findMany({ where: { ownerId } }),
    db.agendaRuleAnswer.findMany({ where: { ownerId } }),
    db.agendaOccurrenceOverride.findMany({ where: { ownerId } }),
  ]);
  return { settings, contacts, places, avails, rules, appointments, items, pins, answers, overrides };
}

/** Today in the MJPM's zone; a stored zone that is not valid falls back on Paris and is reported. */
function zonedToday(timezone: string | undefined, settingsId: string, now: Date) {
  try {
    return { today: todayIn(timezone ?? DEFAULT_TIMEZONE, now), issues: [] as BridgeIssue[] };
  } catch {
    return { today: todayIn(DEFAULT_TIMEZONE, now), issues: [makeIssue("settings", settingsId, "BAD_TIMEZONE")] };
  }
}

/** Today for one MJPM, without loading their agenda. */
export async function ownerToday(ownerId: string, now: Date): Promise<string> {
  const settings = await db.agendaSettings.findUnique({ where: { ownerId }, select: { id: true, timezone: true } });
  return zonedToday(settings?.timezone, settings?.id ?? "none", now).today;
}

/**
 * The engine's state for one MJPM, seen from `now` in the MJPM's timezone.
 * Decryption failures throw (an unreadable agenda must never look empty);
 * rows the engine cannot use are left out and reported in `issues`.
 */
export async function loadPlannerState(ownerId: string, now: Date): Promise<LoadedAgenda> {
  const rows = await readRows(ownerId);
  const zone = zonedToday(rows.settings?.timezone, rows.settings?.id ?? "none", now);
  const { today } = zone;
  const settings = mapSettings(rows.settings);
  if (settings.value === null || rows.settings === null) return { ok: false, today, issues: [...zone.issues, ...settings.issues] };
  const contacts = mapContacts(rows.contacts, rows.places, rows.avails, today);
  const places = mapFreePlaces(rows.places.filter((p) => p.contactId === null));
  const rules = mapRules(rows.rules);
  const appointments = mapAppointments(rows.appointments);
  const items = mapItems(rows.items);
  const pins = mapPins(rows.pins, rows.contacts.map((c) => c.id));
  const overrides = mapOverrides(rows.overrides);
  const { answers, refusedExceptions } = mapAnswers(rows.answers);
  const state: PlannerState = {
    today,
    settings: settings.value,
    places: places.values,
    rules: rules.values,
    contacts: contacts.values,
    appointments: appointments.values,
    validated: items.validated,
    past: items.past,
    skips: overrides.skips,
    priorityOverrides: overrides.priorityOverrides,
    answers,
    refusedExceptions,
    pins: pins.values,
  };
  const issues = [settings, contacts, places, rules, appointments, items, pins, overrides].flatMap((m) => m.issues);
  return { ok: true, state, version: rows.settings.version, issues: [...zone.issues, ...issues] };
}
