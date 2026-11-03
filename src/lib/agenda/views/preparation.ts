import { buildTasks, cityKey, createContext } from "@/lib/agenda-engine/domain";
import type { Contact, IsoDate, Place, PlannerState } from "@/lib/agenda-engine/domain";
import { nextVisitDue } from "@/lib/agenda-engine/domain/recurrence";
import { EHPADS_CORREZE } from "../ehpad-list";
import type { GroupTag } from "../groups-rules";

/**
 * « Préparer ma proposition » (Thomas, 2026-11-03): everyone who can be
 * visited, by town and, inside a town, by establishment (EHPAD…). A town comes
 * up as soon as one of its people is urgent (« quitte à être à Tulle… »).
 * Pure: built from the planner state, no write.
 */

/** OVERDUE: late already; DUE: to see in the period; LATER: could be seen in advance. */
export type PrepUrgency = "OVERDUE" | "DUE" | "LATER";

export type PrepPerson = {
  readonly id: string;
  readonly name: string;
  readonly urgency: PrepUrgency;
  /** When the visit is due (null: never seen, no date yet). */
  readonly due: IsoDate | null;
  readonly siteId: string | null;
  readonly group: GroupTag | null;
};

export type PrepSite = { readonly id: string; readonly name: string; readonly personIds: readonly string[] };

export type PrepTown = {
  readonly key: string;
  readonly name: string;
  /** Centre of the town's addresses: « à côté » is measured from it. */
  readonly lat: number;
  readonly lon: number;
  readonly people: readonly PrepPerson[];
  readonly sites: readonly PrepSite[];
};

export type PrepAppointment = { readonly id: string; readonly title: string; readonly from: IsoDate; readonly to: IsoDate };

export type PreparationView = {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly towns: readonly PrepTown[];
  readonly appointments: readonly PrepAppointment[];
};

const URGENCY_RANK: Readonly<Record<PrepUrgency, number>> = { OVERDUE: 0, DUE: 1, LATER: 2 };

/** « Tulle » from « 12 rue X 19000 Tulle »; the whole label when it has no postcode. */
function townName(address: string): string {
  const match = [...address.matchAll(/\b\d{5}\s+([^,]+)/g)].at(-1);
  return (match?.[1] ?? address).trim();
}

/** The establishment's name: the official EHPAD list, else the start of the address (a place found by its name). */
function siteName(place: Place): string {
  const known = EHPADS_CORREZE.find((e) => e.id === place.site);
  if (known) return known.name;
  return place.address.split(",")[0]?.trim() || "Établissement";
}

type Row = { readonly person: Contact; readonly place: Place; readonly urgency: PrepUrgency; readonly due: IsoDate | null };

function rowsOf(state: PlannerState, from: IsoDate, to: IsoDate): Row[] {
  const ctx = createContext({ ...state, choice: null });
  const { tasks } = buildTasks(ctx, from, to, new Set());
  return state.contacts.flatMap((person): Row[] => {
    const place = person.places[0] ?? person.temporary?.place;
    if (person.category !== "PROTEGE" || person.status !== "ACTIVE" || !person.visits || !place) return [];
    const task = tasks.find((t) => t.person?.id === person.id && t.earliest <= to && t.latest >= from);
    if (task) return [{ person, place: task.place, urgency: task.overdue ? "OVERDUE" : "DUE", due: task.due }];
    return [{ person, place, urgency: "LATER", due: nextVisitDue(ctx, person) }];
  });
}

const byUrgency = (a: PrepPerson, b: PrepPerson) =>
  URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.name.localeCompare(b.name, "fr");

function townOf(key: string, rows: readonly Row[], groups: ReadonlyMap<string, GroupTag>): PrepTown {
  const people = rows
    .map((r): PrepPerson => ({ id: r.person.id, name: r.person.name, urgency: r.urgency, due: r.due, siteId: r.place.site ?? null, group: groups.get(r.person.id) ?? null }))
    .sort(byUrgency);
  const sites = new Map<string, PrepSite>();
  for (const r of rows) {
    const id = r.place.site;
    if (!id) continue;
    const site = sites.get(id) ?? { id, name: siteName(r.place), personIds: [] };
    sites.set(id, { ...site, personIds: [...site.personIds, r.person.id] });
  }
  const lat = rows.reduce((s, r) => s + r.place.lat, 0) / rows.length;
  const lon = rows.reduce((s, r) => s + r.place.lon, 0) / rows.length;
  return { key, name: townName(rows[0]?.place.address ?? key), lat, lon, people, sites: [...sites.values()] };
}

/** The most urgent person of the town decides its place in the list. */
const townRank = (t: PrepTown) => {
  const first = t.people[0];
  return `${first ? URGENCY_RANK[first.urgency] : 9}|${first?.due ?? "9999"}|${t.name}`;
};

export function buildPreparation(state: PlannerState, from: IsoDate, to: IsoDate, groups: ReadonlyMap<string, GroupTag> = new Map()): PreparationView {
  const byTown = new Map<string, Row[]>();
  for (const row of rowsOf(state, from, to)) {
    const key = cityKey(row.place.address) ?? `?${row.place.address}`;
    byTown.set(key, [...(byTown.get(key) ?? []), row]);
  }
  const towns = [...byTown].map(([key, rows]) => townOf(key, rows, groups)).sort((a, b) => townRank(a).localeCompare(townRank(b), "fr"));
  const validated = new Set(state.validated.map((v) => v.apptId ?? ""));
  const appointments = state.appointments
    .filter((a) => a.when.kind !== "FIXED" && !validated.has(a.id) && a.when.from <= to && a.when.to >= from)
    .map((a) => ({ id: a.id, title: a.title, from: a.when.kind === "FIXED" ? a.when.date : a.when.from, to: a.when.kind === "FIXED" ? a.when.date : a.when.to }));
  return { from, to, towns, appointments };
}

/** Towns whose centre is this close to a picked town are put forward (« Naves avec Tulle »). */
const NEAR_KM = 12;

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

export type OrderedTown = { readonly town: PrepTown; readonly near: boolean };

/** Picked towns first, then their neighbours (« à côté »), then the rest in order of urgency. Pure. */
export function orderTowns(towns: readonly PrepTown[], picked: ReadonlySet<string>): OrderedTown[] {
  const chosen = towns.filter((t) => t.people.some((p) => picked.has(p.id)));
  const isNear = (t: PrepTown) => !chosen.includes(t) && chosen.some((c) => km(c, t) <= NEAR_KM);
  const rank = (t: PrepTown) => (chosen.includes(t) ? 0 : isNear(t) ? 1 : 2);
  return towns
    .map((town, i) => ({ town, near: isNear(town), i }))
    .sort((a, b) => rank(a.town) - rank(b.town) || a.i - b.i)
    .map(({ town, near }) => ({ town, near }));
}
