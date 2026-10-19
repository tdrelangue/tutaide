// addAppointment when the stored row cannot be read back by the planner: UNPLANNABLE, never LISTED.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./db";
import { WEEK, depsWith, recordingFetch, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;

// The stand-in stores a FIXED appointment with no date: the schema allows it, the mapper refuses it (BAD_WHEN).
vi.mock("../appointments", async (importOriginal) => {
  const original = await importOriginal<typeof import("../appointments")>();
  return {
    ...original,
    createAppointment: async (ownerId: string, actorId: string) => {
      const { db } = await import("@/lib/db");
      const row = await db.agendaAppointment.create({
        data: { ownerId, createdById: actorId, title: "Broken", placeKind: "OFFICE", durationMin: 60, whenKind: "FIXED", priority: "HIGH" },
        select: { id: true },
      });
      return row.id;
    },
  };
});

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

describe("addAppointment with an unreadable stored row", () => {
  it("answers UNPLANNABLE with the appointment id and the mapper's issues", async () => {
    const { addAppointment } = await import("../bridge/ops/insert");
    const owner = await seedOwner(client, "unplannable@test.invalid");
    const outcome = await addAppointment(
      owner,
      owner,
      { title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, when: { kind: "WEEK", from: WEEK.from, to: WEEK.to }, priority: "HIGH" },
      depsWith(recordingFetch([])),
    );
    assert.equal(outcome.kind, "UNPLANNABLE");
    const stored = await client.agendaAppointment.findFirstOrThrow({ where: { ownerId: owner } });
    assert.deepEqual(outcome.kind === "UNPLANNABLE" ? [outcome.appointmentId, outcome.issues] : null, [stored.id, [{ kind: "appointment", id: stored.id, reason: "BAD_WHEN" }]]);
  });
});
