import type { PrismaClient } from "@prisma/client";
import type { Place, ValidatedItem } from "@/lib/agenda-engine/domain";
import type { AppointmentInput } from "../appointments";
import { createAppointment } from "../appointments";
import { readWeek } from "../bridge/ops/week";
import { buildWeekView } from "../views/week-view";
import type { WeekView } from "../views/types";
import { depsWith, recordingFetch } from "./bridge-fixtures";

/** Builders shared by the view tests (unit tests on real engine outputs, PGlite behind). */

export type RuleSeed = {
  label: string;
  strength?: "HARD" | "STRONG" | "MEDIUM" | "SOFT";
  dow: number;
  allDay?: boolean;
  fromMin?: number;
  toMin?: number;
  atOffice?: boolean;
};

/** An « Indisponible » rule (all day by default). */
export async function addUnavailable(client: PrismaClient, ownerId: string, seed: RuleSeed): Promise<string> {
  const allDay = seed.allDay ?? true;
  const row = await client.agendaRule.create({
    data: {
      ownerId,
      type: "UNAVAILABLE",
      label: seed.label,
      strength: seed.strength ?? "HARD",
      dow: seed.dow,
      allDay,
      fromMin: allDay ? null : (seed.fromMin ?? null),
      toMin: allDay ? null : (seed.toMin ?? null),
      atOffice: seed.atOffice ?? false,
    },
  });
  return row.id;
}

/** An appointment through the real service (participants and place checked). */
export async function addAppointmentRow(ownerId: string, over: Partial<AppointmentInput> = {}): Promise<string> {
  const input: AppointmentInput = {
    title: "Signature chez le notaire",
    participantIds: [],
    place: { kind: "OFFICE" },
    durationMin: 60,
    when: { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" },
    priority: "HIGH",
    ...over,
  };
  return createAppointment(ownerId, ownerId, input);
}

const PLACE: Place = { id: "item:x", label: "Domicile", address: "1 rue Test, Lille", lat: 50.63, lon: 3.06 };

/** A synthetic validated item for the pure builders. */
export function validatedItem(over: Partial<ValidatedItem> = {}): ValidatedItem {
  return {
    id: "item-1",
    apptId: null,
    kind: "VISIT",
    title: "Visite à Jean Bonneau",
    participants: [],
    personId: null,
    place: PLACE,
    dur: 60,
    date: "2026-10-21",
    start: 600,
    end: 660,
    priority: "NORMAL",
    earliest: "2026-10-21",
    latest: "2026-10-21",
    fixed: false,
    movable: false,
    moved: false,
    ...over,
  };
}

/** The week view of a period as the actions build it: IGN answers through `urls`, `NOW` as the clock. */
export async function weekViewOf(ownerId: string, period: { from: string; to: string }, withProposal: boolean, urls: string[] = []): Promise<WeekView> {
  const read = await readWeek(ownerId, period, depsWith(recordingFetch(urls)), withProposal);
  if (!read.ok) throw new Error(`expected a readable week, got ${read.reason}`);
  return buildWeekView({ state: read.state, from: period.from, to: period.to, proposal: read.proposal, issues: read.issues });
}
