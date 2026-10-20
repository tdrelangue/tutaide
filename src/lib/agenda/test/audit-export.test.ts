// « Extraction pour un audit »: what it gathers for one person over a period, and the spreadsheet it produces.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAppointment } from "../appointments";
import { auditQuerySchema, buildAuditExport, exportFileName, statusOf, toCsv } from "../audit-export";
import { AgendaUserError } from "../bridge/errors";
import { addTask, saveNotes } from "../notes";
import { createTestDb } from "./db";
import { addPerson, insertItem, seedOwner } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

describe("buildAuditExport", () => {
  it("lists the person's visits and appointments in the period, oldest first, with notes and tasks", async () => {
    const owner = await seedOwner(client, "audit@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const anne = await addPerson(client, owner, "Anne Anasse");
    const appointmentId = await createAppointment(owner, owner, {
      title: "Signature chez le notaire", participantIds: [jean], place: { kind: "OFFICE" }, durationMin: 60, priority: "HIGH",
      when: { kind: "FIXED", date: "2026-09-10", timeMin: 600 },
    });
    await saveNotes(owner, appointmentId, "Copie remise");
    await addTask(owner, appointmentId, "Pièce d'identité");
    await insertItem(client, owner, { itemKey: "appt", contactId: jean, title: "Signature chez le notaire", date: "2026-09-10", start: 600, kind: "APPT", appointmentId });
    await insertItem(client, owner, { itemKey: `${jean}@2026-08-01`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-08-01", start: 540 });
    await insertItem(client, owner, { itemKey: `${anne}@2026-08-02`, contactId: anne, title: "Visite à Anne Anasse", date: "2026-08-02", start: 540 });
    await insertItem(client, owner, { itemKey: `${jean}@2025-01-01`, contactId: jean, title: "Trop ancienne", date: "2025-01-01", start: 540 });

    const data = await buildAuditExport(owner, auditQuerySchema.parse({ personId: jean, from: "2026-01-01", to: "2026-12-31" }), "2026-10-20");

    assert.equal(data.personName, "Jean Bonneau");
    assert.deepEqual(data.rows.map((r) => [r.date, r.title, r.status]), [
      ["2026-08-01", "Visite à Jean Bonneau", "DONE"],
      ["2026-09-10", "Signature chez le notaire", "DONE"],
    ]);
    assert.equal(data.rows[1]?.notes, "Copie remise");
    assert.deepEqual(data.rows[1]?.tasks, [{ label: "Pièce d'identité", done: false }]);
    assert.ok(data.rows[0]?.placeAddress.length);
  });

  it("refuses a person of another MJPM", async () => {
    const owner = await seedOwner(client, "audit-a@test.invalid");
    const other = await seedOwner(client, "audit-b@test.invalid");
    const jean = await addPerson(client, other, "Jean Bonneau");
    await assert.rejects(buildAuditExport(owner, auditQuerySchema.parse({ personId: jean, from: "2026-01-01", to: "2026-12-31" }), "2026-10-20"), AgendaUserError);
  });
});

describe("audit query and CSV", () => {
  it("refuses an inverted or too long period", () => {
    const id = "a".repeat(25);
    assert.equal(auditQuerySchema.safeParse({ personId: id, from: "2026-10-20", to: "2026-01-01" }).success, false);
    assert.equal(auditQuerySchema.safeParse({ personId: id, from: "2010-01-01", to: "2026-01-01" }).success, false);
    assert.equal(auditQuerySchema.safeParse({ personId: id, from: "2020-01-01", to: "2026-01-01" }).success, true);
  });

  it("tells done, planned, missed and cancelled apart", () => {
    assert.equal(statusOf("VALIDATED", "2026-10-19", "2026-10-20"), "DONE");
    assert.equal(statusOf("VALIDATED", "2026-10-20", "2026-10-20"), "PLANNED");
    assert.equal(statusOf("VALIDATED", "2026-10-21", "2026-10-20"), "PLANNED");
    assert.equal(statusOf("MISSED", "2026-10-01", "2026-10-20"), "MISSED");
    assert.equal(statusOf("CANCELLED", "2026-10-01", "2026-10-20"), "CANCELLED");
  });

  it("writes a French Excel CSV: BOM, semicolons, doubled quotes, neutralised formulas", () => {
    const csv = toCsv({
      personName: "Jean Bonneau",
      from: "2026-01-01",
      to: "2026-12-31",
      rows: [{
        date: "2026-09-10", startMin: 600, endMin: 660, kind: "APPT", title: "=HYPERLINK(\"x\")", status: "DONE",
        placeLabel: "Au bureau", placeAddress: "1 rue \"Haute\"", otherParticipants: [], notes: "ok", tasks: [{ label: "Signer", done: true }],
      }],
    });
    assert.ok(csv.startsWith("﻿\"Date\";"));
    const line = csv.split("\r\n")[1] ?? "";
    assert.ok(line.startsWith("\"10/09/2026\";\"10:00\";\"11:00\";\"Rendez-vous\";\"'=HYPERLINK(\"\"x\"\")\";\"Vu\""));
    assert.ok(line.includes("\"1 rue \"\"Haute\"\"\""));
    assert.ok(line.endsWith("\"[x] Signer\""));
  });

  it("names the file without accents or spaces", () => {
    assert.equal(exportFileName({ personName: "Théo Rème", from: "2026-01-01", to: "2026-10-20", rows: [] }), "extraction-theo-reme-2026-01-01-2026-10-20.csv");
  });
});
