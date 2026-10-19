import type { PrismaClient } from "@prisma/client";
import type { FetchLike } from "@/lib/agenda-engine/geo";
import * as service from "../service";
import type { PlanDeps } from "../bridge/ops/plan";
import { seal, sealPoint } from "../sealed";
import type { AgendaSettingsInput } from "../validation";

/** Shared builders of the bridge integration tests: realistic data through the real service, IGN never called. */

/** A Monday, 10:00 in Paris. */
export const NOW = new Date("2026-10-19T08:00:00Z");
export const TODAY = "2026-10-19";
export const WEEK: { from: string; to: string } = { from: "2026-10-19", to: "2026-10-23" };

export const LILLE = { label: "Place du Théâtre, 59000 Lille", lat: 50.6372, lon: 3.0633, precision: "housenumber" as const };
export const ROUBAIX = { label: "Résidence Les Tilleuls, 59100 Roubaix", lat: 50.6907, lon: 3.1746, precision: "housenumber" as const };
export const TOURCOING = { label: "Allée des Peupliers, 59200 Tourcoing", lat: 50.7239, lon: 3.1612, precision: "housenumber" as const };
export const VILLENEUVE = { label: "Rue des Érables, 59650 Villeneuve-d'Ascq", lat: 50.6175, lon: 3.1473, precision: "housenumber" as const };

export const SETTINGS: AgendaSettingsInput = {
  home: LILLE,
  office: null,
  workDays: [1, 2, 3, 4, 5],
  dayStartMinutes: 510,
  dayEndMinutes: 1080,
  dayEndLimitMinutes: 1140,
  defaultVisitMinutes: 60,
};

/** An IGN itinerary answer (see parseRouteResponse). */
const ROUTE_ANSWER = { distance: 8, duration: 14, distanceUnit: "kilometer", timeUnit: "minute" };

export function recordingFetch(urls: string[]): FetchLike {
  return async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ROUTE_ANSWER };
  };
}

export const failingFetch: FetchLike = async () => {
  throw new Error("network down");
};

export function depsWith(fetch: FetchLike): PlanDeps {
  return { fetch, now: NOW };
}

export async function seedOwner(client: PrismaClient, email: string, settings: AgendaSettingsInput = SETTINGS): Promise<string> {
  const ownerId = (await client.user.create({ data: { email, passwordHash: "x" } })).id;
  await service.saveAgendaSettings(ownerId, settings);
  return ownerId;
}

type PersonOptions = { address?: typeof ROUBAIX | null; lastVisitOn?: string | null; period?: "WEEK" | "MONTH" | "QUARTER" | "YEAR" };

/** A protected person with a monthly visit, last seen `lastVisitOn` (default: overdue). Returns the contact id. */
export async function addPerson(client: PrismaClient, ownerId: string, fullName: string, options: PersonOptions = {}): Promise<string> {
  const { address = ROUBAIX, lastVisitOn = "2026-09-01", period = "MONTH" } = options;
  await service.createAgendaPerson(ownerId, ownerId, {
    fullName,
    address,
    visitsPerPeriod: 1,
    visitPeriod: period,
    visitMinutes: null,
    notes: null,
    status: "ACTIVE",
    endReason: null,
  });
  const contact = await client.agendaContact.findFirstOrThrow({ where: { ownerId, fullName } });
  if (lastVisitOn !== null) await client.agendaContact.update({ where: { id: contact.id }, data: { lastVisitOn: new Date(`${lastVisitOn}T00:00:00.000Z`) } });
  return contact.id;
}

type ItemSeed = {
  itemKey: string;
  contactId: string;
  title: string;
  date: string;
  start: number;
  status?: "VALIDATED" | "MISSED" | "CANCELLED";
  address?: typeof ROUBAIX;
  kind?: "VISIT" | "APPT";
  appointmentId?: string | null;
};

const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** A stored item written the way validation writes it: address and coordinates encrypted. */
export async function insertItem(client: PrismaClient, ownerId: string, seed: ItemSeed) {
  const where = seed.address ?? ROUBAIX;
  return client.agendaItem.create({
    data: {
      ownerId,
      itemKey: seed.itemKey,
      kind: seed.kind ?? "VISIT",
      appointmentId: seed.appointmentId ?? null,
      contactId: seed.contactId,
      title: seed.title,
      placeLabel: "Domicile",
      placeAddress: seal(where.label),
      placePoint: sealPoint(where),
      date: asDate(seed.date),
      startMin: seed.start,
      endMin: seed.start + 60,
      priority: "NORMAL",
      earliestDate: asDate(seed.date),
      latestDate: asDate(seed.date),
      status: seed.status ?? "VALIDATED",
      participants: { create: [{ contactId: seed.contactId }] },
    },
  });
}
