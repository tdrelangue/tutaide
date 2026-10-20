import type {
  AgendaAppointment,
  AgendaAvailability,
  AgendaContact,
  AgendaItem,
  AgendaPin,
  AgendaPlace,
  AgendaRule,
  AgendaSettings,
} from "@prisma/client";
import { seal, sealPoint } from "../sealed";

/** Row factories for the mapping tests: valid by default, tweak with `over`. */

export const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export const POINT = { lat: 48.11, lon: -1.68 };

export function settingsRow(over: Partial<AgendaSettings> = {}): AgendaSettings {
  return {
    id: "s1",
    ownerId: "o1",
    homeAddress: seal("1 rue de la Paix"),
    homePoint: sealPoint(POINT),
    homePrecision: null,
    officeAddress: null,
    officePoint: null,
    officePrecision: null,
    workDays: [1, 2, 3, 4, 5],
    dayStartMin: 510,
    dayEndMin: 1080,
    dayEndLimitMin: 1140,
    lunchStartMin: 750,
    lunchEndMin: 810,
    defaultVisitMin: 60,
    timezone: "Europe/Paris",
    version: 0,
    createdAt: day("2026-01-01"),
    updatedAt: day("2026-01-01"),
    ...over,
  };
}

export function contactRow(over: Partial<AgendaContact> = {}): AgendaContact {
  return {
    id: "c1",
    ownerId: "o1",
    createdById: null,
    category: "PROTEGE",
    fullName: "Jean Bonneau",
    role: null,
    linkedContactId: null,
    dossierGroupKey: null,
    notBeforeMin: null,
    notes: null,
    visitsPerPeriod: null,
    visitPeriod: null,
    visitPriority: null,
    visitMin: null,
    lastVisitOn: null,
    prefDayDow: null,
    prefDayStrength: null,
    status: "ACTIVE",
    endReason: null,
    endedOn: null,
    createdAt: day("2026-01-01"),
    updatedAt: day("2026-01-01"),
    ...over,
  };
}

export function placeRow(over: Partial<AgendaPlace> = {}): AgendaPlace {
  return {
    id: "p1",
    ownerId: "o1",
    contactId: "c1",
    label: "Domicile",
    address: seal("3 rue du Port"),
    point: sealPoint({ lat: 48.2, lon: -1.7 }),
    precision: null,
    position: 0,
    ...over,
  };
}

export function availRow(over: Partial<AgendaAvailability> = {}): AgendaAvailability {
  return { id: "a1", contactId: "c1", dows: [1, 2], fromMin: 1020, toMin: 1140, ...over };
}

export function ruleRow(over: Partial<AgendaRule> = {}): AgendaRule {
  return {
    id: "r1",
    ownerId: "o1",
    type: "UNAVAILABLE",
    label: "Mercredi",
    strength: "HARD",
    dow: 3,
    allDay: true,
    fromMin: null,
    toMin: null,
    atOffice: false,
    maxVisits: null,
    fromDate: null,
    toDate: null,
    createdAt: day("2026-01-01"),
    ...over,
  };
}

export function apptRow(over: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: "ap1",
    ownerId: "o1",
    createdById: null,
    title: "Juge",
    placeKind: "OFFICE",
    placeId: null,
    durationMin: 45,
    whenKind: "FIXED",
    date: day("2026-11-03"),
    timeMin: 600,
    fromDate: null,
    toDate: null,
    priority: "HIGH",
    version: 0,
    notes: null,
    createdAt: day("2026-01-01"),
    updatedAt: day("2026-01-01"),
    ...over,
  };
}

export function itemRow(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "i1",
    ownerId: "o1",
    itemKey: "c1@2026-11-03",
    kind: "VISIT",
    notes: null,
    appointmentId: null,
    contactId: "c1",
    title: "Visite Jean",
    placeLabel: "Domicile",
    placeAddress: seal("3 rue du Port"),
    placePoint: sealPoint({ lat: 48.2, lon: -1.7 }),
    placeRemote: false,
    date: day("2026-11-03"),
    startMin: 600,
    endMin: 660,
    priority: "NORMAL",
    earliestDate: day("2026-11-01"),
    latestDate: day("2026-11-10"),
    fixed: false,
    movable: true,
    moved: false,
    status: "VALIDATED",
    statusAt: null,
    createdAt: day("2026-01-01"),
    updatedAt: day("2026-01-01"),
    ...over,
  };
}

export function pinRow(over: Partial<AgendaPin> = {}): AgendaPin {
  return {
    id: "pin1",
    ownerId: "o1",
    itemKey: "c1@2026-11-03",
    kind: "VISIT",
    appointmentId: null,
    contactId: "c1",
    title: "Visite Jean",
    participantIds: ["c1"],
    placeLabel: "Domicile",
    placeAddress: seal("3 rue du Port"),
    placePoint: sealPoint({ lat: 48.2, lon: -1.7 }),
    placeRemote: false,
    durationMin: 60,
    priority: "NORMAL",
    date: day("2026-11-04"),
    startMin: 840,
    createdAt: day("2026-01-01"),
    ...over,
  };
}
