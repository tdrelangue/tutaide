// Insert views, visit status and the appointment list, on real engine outputs.
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { InsertResult, PlannerState } from "@/lib/agenda-engine/domain";
import { listAppointments } from "../appointments";
import type { AppointmentInput } from "../appointments";
import { loadPlannerState } from "../bridge/load";
import { MAX_MOVABLE, addAppointment, movableCandidates, previewMoves } from "../bridge/ops/insert";
import { proposePeriod, validatePeriod } from "../bridge/ops/plan";
import { seal, sealPoint } from "../sealed";
import { buildInsertView, buildMovesPreview } from "../views/insert-view";
import { toAppointmentRow, sortAppointmentRows } from "../views/appointment-rows";
import type { AppointmentRecord } from "../views/appointment-rows";
import { buildVisitStatus } from "../views/visit-status";
import { createTestDb } from "./db";
import { NOW, ROUBAIX, WEEK, addPerson, depsWith, insertItem, recordingFetch, seedOwner } from "./bridge-fixtures";
import { addAppointmentRow, validatedItem } from "./views-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const deps = depsWith(recordingFetch([]));

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const thisWeek: AppointmentInput["when"] = { kind: "WEEK", from: WEEK.from, to: WEEK.to };
const appointment = (over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  title: "Audience chez le juge", participantIds: [], place: { kind: "OFFICE" }, durationMin: 60, when: thisWeek, priority: "HIGH", ...over,
});

async function validatedWeek(email: string) {
  const owner = await seedOwner(client, email);
  const jean = await addPerson(client, owner, "Jean Bonneau");
  const proposed = await proposePeriod(owner, WEEK, deps);
  if (!proposed.ok) throw new Error("expected a plannable agenda");
  await validatePeriod(owner, WEEK, proposed.fingerprint, deps);
  return { owner, jean };
}

async function stateOf(owner: string): Promise<PlannerState> {
  const loaded = await loadPlannerState(owner, NOW);
  if (!loaded.ok) throw new Error("expected a plannable agenda");
  return loaded.state;
}

async function visitStatusOf(owner: string) {
  const loaded = await loadPlannerState(owner, NOW);
  if (!loaded.ok) throw new Error("expected a plannable agenda");
  return buildVisitStatus(loaded.state, loaded.issues);
}

describe("movableCandidates", () => {
  const state = (validated: PlannerState["validated"]): PlannerState => ({ today: "2026-10-19", validated }) as unknown as PlannerState; // a partial state: only today and validated are read

  it("keeps future, non-fixed items, soonest first", () => {
    const items = [
      validatedItem({ id: "late", date: "2026-10-23", start: 600 }),
      validatedItem({ id: "fixed", date: "2026-10-21", fixed: true }),
      validatedItem({ id: "today", date: "2026-10-19" }),
      validatedItem({ id: "past", date: "2026-10-12" }),
      validatedItem({ id: "soon-pm", date: "2026-10-20", start: 840 }),
      validatedItem({ id: "soon-am", date: "2026-10-20", start: 540 }),
    ];
    assert.deepEqual(movableCandidates(state(items)).map((v) => v.id), ["soon-am", "soon-pm", "late"]);
  });

  it("returns at most MAX_MOVABLE and does not reorder the state", () => {
    const items = Array.from({ length: MAX_MOVABLE + 20 }, (_, i) => validatedItem({ id: `i${i}`, date: "2026-11-02", start: 480 + i }));
    const reversed = [...items].reverse();
    assert.equal(movableCandidates(state(reversed)).length, MAX_MOVABLE);
    assert.equal(reversed[0].id, items[items.length - 1].id);
  });

  it("returns nothing for an empty planning", () => {
    assert.deepEqual(movableCandidates(state([])), []);
  });
});

describe("buildInsertView", () => {
  it("maps each outcome of rule 12", async () => {
    const { owner } = await validatedWeek("mv-views@test.invalid");
    const listed = await addAppointment(owner, owner, appointment({ when: { kind: "WEEK", from: "2026-11-02", to: "2026-11-06" } }), deps);
    assert.deepEqual(buildInsertView(listed, []), { kind: "LISTED", appointmentId: listed.kind === "LISTED" ? listed.appointmentId : "" });

    const touching = await addAppointment(owner, owner, appointment(), deps);
    const candidates = movableCandidates(await stateOf(owner));
    const view = buildInsertView(touching, candidates);
    assert.equal(view.kind, "NEEDS_INSERT");
    if (view.kind !== "NEEDS_INSERT") return;
    assert.ok(view.options.length >= 1);
    assert.deepEqual(Object.keys(view.options[0]).sort(), ["addKm", "date", "end", "start"]);
    assert.deepEqual(view.candidates.map((c) => c.itemKey), candidates.map((c) => c.id));
  });

  it("lists the conflicts of a fixed time as item references", async () => {
    const { owner, jean } = await validatedWeek("mv-conflict@test.invalid");
    const outcome = await addAppointment(owner, owner, appointment({ when: { kind: "FIXED", date: "2026-10-19", timeMin: 540 }, durationMin: 120 }), deps);
    const view = buildInsertView(outcome, []);
    assert.equal(view.kind, "NEEDS_INSERT");
    if (view.kind !== "NEEDS_INSERT") return;
    assert.equal(view.conflicts.length, 1);
    assert.deepEqual(Object.keys(view.conflicts[0]).sort(), ["date", "fixed", "itemKey", "start", "title"]);
    assert.ok(view.conflicts[0].itemKey.startsWith(jean));
  });

  it("turns issues into plain French for NOT_PLANNABLE and UNPLANNABLE", () => {
    const issues = [{ kind: "settings" as const, id: "none", reason: "NO_HOME" }];
    const notPlannable = buildInsertView({ kind: "NOT_PLANNABLE", issues }, []);
    assert.deepEqual(notPlannable, { kind: "NOT_PLANNABLE", issues: [{ kind: "NO_HOME", message: (notPlannable.kind === "NOT_PLANNABLE" ? notPlannable.issues[0].message : ""), fixTab: "parametres" }] });
    const unplannable = buildInsertView({ kind: "UNPLANNABLE", appointmentId: "a".repeat(25), issues: [{ kind: "appointment", id: "x", reason: "BAD_WHEN" }] }, []);
    assert.equal(unplannable.kind, "UNPLANNABLE");
    assert.equal(unplannable.kind === "UNPLANNABLE" ? unplannable.issues[0].fixTab : "", "rendez-vous");
  });
});

describe("buildMovesPreview", () => {
  it("describes the moves of a real preview and its fingerprint", async () => {
    const { owner } = await validatedWeek("mv-preview@test.invalid");
    const outcome = await addAppointment(owner, owner, appointment({ when: { kind: "FIXED", date: "2026-10-19", timeMin: 540 }, durationMin: 120 }), deps);
    assert.equal(outcome.kind, "NEEDS_INSERT");
    const { result, fingerprint } = await previewMoves(owner, outcome.kind === "NEEDS_INSERT" ? outcome.appointmentId : "", [], deps);
    const preview = buildMovesPreview(result, fingerprint);
    assert.equal(preview.fingerprint, fingerprint);
    assert.deepEqual(preview.placement, result.placement && { date: result.placement.date, start: result.placement.start, end: result.placement.end });
    assert.equal(preview.hasRemovals, false);
  });

  it("names the moves, the removals and the bent rules, each rule once", () => {
    const item = validatedItem({ id: "moved", title: "Visite déplacée", date: "2026-10-21", start: 600 });
    const gone = validatedItem({ id: "gone", title: "Visite supprimée" });
    const rule = { id: "r1", type: "PREF_DAY" as const, dow: 3 as const, strength: "MEDIUM" as const, label: "Mercredi de préférence" };
    const task = { id: "t" } as unknown as InsertResult["bent"][number]["task"]; // only the rule label is read
    const result: InsertResult = {
      placement: { date: "2026-10-20", start: 540, end: 600 },
      changes: [
        { item, to: { date: "2026-10-22", start: 660, end: 720 } },
        { item: gone, to: null },
      ],
      bent: [{ rule, task, date: "2026-10-22" }, { rule, task, date: "2026-10-23" }],
    };
    const preview = buildMovesPreview(result, "abc");
    assert.deepEqual(preview.changes[0], { itemKey: "moved", title: "Visite déplacée", from: { date: "2026-10-21", start: 600 }, to: { date: "2026-10-22", start: 660, end: 720 } });
    assert.equal(preview.changes[1].to, null);
    assert.equal(preview.hasRemovals, true);
    assert.deepEqual(preview.bent, ["Mercredi de préférence"]);
  });

  it("keeps a null placement", () => {
    assert.equal(buildMovesPreview({ placement: null, changes: [], bent: [] }, "f").placement, null);
  });
});

describe("buildVisitStatus", () => {
  it("gives seen, planned and next due dates per protected person", async () => {
    const owner = await seedOwner(client, "vs-basic@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: "2026-09-01" });
    const aude = await addPerson(client, owner, "Aude Javel", { lastVisitOn: "2026-09-01" });
    await insertItem(client, owner, { itemKey: `${aude}@2026-10-12`, contactId: aude, title: "Visite passée", date: "2026-10-12", start: 600 });
    await insertItem(client, owner, { itemKey: `${aude}@2026-10-22`, contactId: aude, title: "Visite prévue", date: "2026-10-22", start: 600 });
    await insertItem(client, owner, { itemKey: `${aude}@2026-10-26`, contactId: aude, title: "Visite plus tard", date: "2026-10-26", start: 600 });
    const rows = await visitStatusOf(owner);
    const row = (id: string) => rows.find((r) => r.personId === id);
    assert.deepEqual(row(jean), { personId: jean, seenOn: "2026-09-01", plannedOn: null, nextDue: "2026-10-01", paused: false });
    assert.equal(row(aude)?.seenOn, "2026-10-12");
    assert.equal(row(aude)?.plannedOn, "2026-10-22");
    assert.equal(row(aude)?.nextDue, "2026-11-25");
  });

  it("counts a visit today as planned, flags a paused person and leaves a finished follow-up out", async () => {
    const owner = await seedOwner(client, "vs-status@test.invalid");
    const today = await addPerson(client, owner, "Annie Versaire");
    const paused = await addPerson(client, owner, "Paul Ochon");
    const ended = await addPerson(client, owner, "Marc Assin");
    await client.agendaContact.update({ where: { id: paused }, data: { status: "PAUSED" } });
    await client.agendaContact.update({ where: { id: ended }, data: { status: "ENDED", endReason: "DECES" } });
    await insertItem(client, owner, { itemKey: `${today}@2026-10-19`, contactId: today, title: "Visite du jour", date: "2026-10-19", start: 600 });
    const rows = await visitStatusOf(owner);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.personId === today)?.plannedOn, "2026-10-19");
    assert.equal(rows.find((r) => r.personId === paused)?.paused, true);
    assert.equal(rows.some((r) => r.personId === ended), false);
  });

  it("does not pass off the assumed last visit as a real one, but still says when the visit is due", async () => {
    const owner = await seedOwner(client, "vs-unknown@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: null });
    const [row] = await visitStatusOf(owner);
    assert.deepEqual(row, { personId: jean, seenOn: null, plannedOn: null, nextDue: "2026-10-19", paused: false });
  });
});

describe("listAppointments", () => {
  it("derives A_PLACER, PREVU, FAIT and ANNULE from the validated planning", async () => {
    const owner = await seedOwner(client, "la-status@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const open = await addAppointmentRow(owner, { title: "À placer", participantIds: [jean], when: { kind: "RANGE", from: "2026-10-26", to: "2026-10-30" } });
    const planned = await addAppointmentRow(owner, { title: "Prévu", when: { kind: "FIXED", date: "2026-10-21", timeMin: 600 } });
    const held = await addAppointmentRow(owner, { title: "Fait", when: { kind: "FIXED", date: "2026-10-14", timeMin: 600 } });
    const over = await addAppointmentRow(owner, { title: "Dépassé", when: { kind: "RANGE", from: "2026-10-05", to: "2026-10-09" } });
    const requeued = await addAppointmentRow(owner, { title: "Replacé", when: { kind: "RANGE", from: "2026-10-26", to: "2026-10-30" } });
    await insertItem(client, owner, { itemKey: planned, contactId: jean, kind: "APPT", appointmentId: planned, title: "Prévu", date: "2026-10-21", start: 600 });
    await insertItem(client, owner, { itemKey: held, contactId: jean, kind: "APPT", appointmentId: held, title: "Fait", date: "2026-10-14", start: 600 });
    await insertItem(client, owner, { itemKey: "MISSED:z", contactId: jean, kind: "APPT", appointmentId: requeued, title: "Replacé", date: "2026-10-15", start: 600, status: "MISSED" });
    const rows = await listAppointments(owner, NOW);
    const status = Object.fromEntries(rows.map((r) => [r.title, r.status]));
    assert.deepEqual(status, { "À placer": "A_PLACER", Prévu: "PREVU", Fait: "FAIT", Dépassé: "ANNULE", Replacé: "A_PLACER" });
    assert.equal(rows.find((r) => r.id === planned)?.scheduledOn, "2026-10-21");
    assert.equal(rows.find((r) => r.id === held)?.scheduledOn, "2026-10-14");
    assert.equal(rows.find((r) => r.id === open)?.scheduledOn, null);
    assert.equal(rows.find((r) => r.id === over)?.scheduledOn, null);
  });

  it("sorts soonest first and describes the dates, the length, the priority and the participants", async () => {
    const owner = await seedOwner(client, "la-sort@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const aude = await addPerson(client, owner, "Aude Javel");
    await addAppointmentRow(owner, { title: "B plus tard", when: { kind: "WEEK", from: "2026-11-02", to: "2026-11-06" }, participantIds: [jean, aude], durationMin: 45, priority: "MUST" });
    await addAppointmentRow(owner, { title: "A d'abord", when: { kind: "FIXED", date: "2026-10-20", timeMin: 840 } });
    await addAppointmentRow(owner, { title: "A aussi", when: { kind: "FIXED", date: "2026-10-20", timeMin: 900 } });
    const rows = await listAppointments(owner, NOW);
    assert.deepEqual(rows.map((r) => r.title), ["A aussi", "A d'abord", "B plus tard"]);
    const later = rows[2];
    assert.deepEqual(later.when, { kind: "WEEK", from: "2026-11-02", to: "2026-11-06" });
    assert.deepEqual([later.durationMin, later.priority], [45, "MUST"]);
    assert.deepEqual([...later.participantNames].sort(), ["Aude Javel", "Jean Bonneau"]);
    assert.deepEqual(rows[1].when, { kind: "FIXED", date: "2026-10-20", timeMin: 840 });
  });

  it("labels the place: home, office, video call or a free place", async () => {
    const owner = await seedOwner(client, "la-places@test.invalid");
    const place = await client.agendaPlace.create({
      data: { ownerId: owner, label: "Étude Me Tabellion", address: seal(ROUBAIX.label), point: sealPoint(ROUBAIX), precision: "housenumber" },
    });
    for (const [title, choice] of [["H", { kind: "HOME" }], ["O", { kind: "OFFICE" }], ["V", { kind: "VISIO" }], ["P", { kind: "PLACE", placeId: place.id }]] as const) {
      await addAppointmentRow(owner, { title: `Lieu ${title}`, place: choice, when: { kind: "FIXED", date: "2026-10-21", timeMin: 540 } });
    }
    const labels = Object.fromEntries((await listAppointments(owner, NOW)).map((r) => [r.title, r.placeLabel]));
    assert.deepEqual(labels, { "Lieu H": "Domicile", "Lieu O": "Bureau", "Lieu V": "Visio", "Lieu P": "Étude Me Tabellion" });
  });

  it("lists only the owner's appointments", async () => {
    const mine = await seedOwner(client, "la-mine@test.invalid");
    const theirs = await seedOwner(client, "la-theirs@test.invalid");
    await addAppointmentRow(theirs, { title: "Secret des autres" });
    assert.deepEqual(await listAppointments(mine, NOW), []);
  });

  it("uses the owner's timezone for today", async () => {
    const owner = await seedOwner(client, "la-zone@test.invalid");
    await client.agendaSettings.update({ where: { ownerId: owner }, data: { timezone: "Pacific/Auckland" } });
    await addAppointmentRow(owner, { title: "Fini à Paris, pas à Auckland", when: { kind: "FIXED", date: "2026-10-19", timeMin: 600 } });
    // 2026-10-19 08:00Z is already 2026-10-19 21:00 in Auckland: the fixed day is today, not over.
    const [row] = await listAppointments(owner, NOW);
    assert.equal(row.status, "A_PLACER");
    const [later] = await listAppointments(owner, new Date("2026-10-19T12:00:00Z"));
    assert.equal(later.status, "ANNULE");
  });
});

describe("toAppointmentRow", () => {
  const record = (over: Partial<AppointmentRecord>): AppointmentRecord => ({
    id: "a".repeat(25), ownerId: "o", createdById: null, title: "T", placeKind: "OFFICE", placeId: null, durationMin: 30, whenKind: "FIXED",
    date: new Date("2026-10-20T00:00:00Z"), timeMin: 600, fromDate: null, toDate: null, priority: "NORMAL", version: 0,
    createdAt: NOW, updatedAt: NOW, participants: [], place: null, items: [], ...over,
  });

  it("skips a row without dates instead of inventing some", () => {
    assert.equal(toAppointmentRow(record({ date: null }), "2026-10-19"), null);
    assert.equal(toAppointmentRow(record({ whenKind: "WEEK", fromDate: null }), "2026-10-19"), null);
  });

  it("shows a removed free place as such", () => {
    assert.equal(toAppointmentRow(record({ placeKind: "PLACE" }), "2026-10-19")?.placeLabel, "Lieu supprimé");
  });

  it("takes the next validated day when several exist, and ignores missed ones", () => {
    const items = [
      { date: new Date("2026-10-10T00:00:00Z"), status: "VALIDATED" as const },
      { date: new Date("2026-10-22T00:00:00Z"), status: "VALIDATED" as const },
      { date: new Date("2026-10-30T00:00:00Z"), status: "VALIDATED" as const },
      { date: new Date("2026-10-25T00:00:00Z"), status: "MISSED" as const },
    ];
    assert.equal(toAppointmentRow(record({ items }), "2026-10-19")?.scheduledOn, "2026-10-22");
  });

  it("sorts without mutating its input", () => {
    const a = toAppointmentRow(record({ id: "a".repeat(25), title: "B" }), "2026-10-19");
    const b = toAppointmentRow(record({ id: "b".repeat(25), title: "A" }), "2026-10-19");
    assert.ok(a && b);
    const input = [a, b];
    assert.deepEqual(sortAppointmentRows(input).map((r) => r.title), ["A", "B"]);
    assert.equal(input[0].title, "B");
  });
});

describe("buildVisitStatus without the load issues", () => {
  it("takes the last visit on file at its word", async () => {
    const owner = await seedOwner(client, "vs-noissues@test.invalid");
    await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: null });
    const [row] = buildVisitStatus(await stateOf(owner));
    assert.equal(row.seenOn, "2026-09-19");
  });

  it("keeps a real visit even when the person had no last visit on file", async () => {
    const owner = await seedOwner(client, "vs-real@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: null });
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-14`, contactId: jean, title: "Visite", date: "2026-10-14", start: 600 });
    const [row] = await visitStatusOf(owner);
    assert.equal(row.seenOn, "2026-10-14");
  });
});
