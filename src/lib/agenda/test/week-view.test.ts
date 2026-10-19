// readWeek + buildWeekView on real engine outputs (PGlite fixtures, IGN stubbed).
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { readWeek } from "../bridge/ops/week";
import { pinBlock } from "../bridge/ops/adjust";
import { setOccurrence } from "../bridge/ops/adjust";
import { validatePeriod } from "../bridge/ops/plan";
import type { EntryView, WeekView } from "../views/types";
import { createTestDb } from "./db";
import { NOW, TOURCOING, addPerson, depsWith, failingFetch, insertItem, recordingFetch, seedOwner } from "./bridge-fixtures";
import { addAppointmentRow, addUnavailable, weekViewOf } from "./views-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const THIS_WEEK = { from: "2026-10-19", to: "2026-10-25" };
const LAST_WEEK = { from: "2026-10-12", to: "2026-10-18" };

beforeAll(async () => {
  ({ client, close } = await createTestDb());
});
afterAll(() => close());

const entriesOf = (view: WeekView, date: string): readonly EntryView[] => view.days.find((d) => d.date === date)?.entries ?? [];
const allEntries = (view: WeekView): EntryView[] => view.days.flatMap((d) => [...d.entries]);
const bySource = (view: WeekView, source: EntryView["source"]) => allEntries(view).filter((e) => e.source === source);

describe("readWeek", () => {
  it("refuses a period that is not two ordered real dates", async () => {
    const owner = await seedOwner(client, "wk-invalid@test.invalid");
    const read = await readWeek(owner, { from: "2026-10-25", to: "2026-10-19" }, depsWith(failingFetch), false);
    assert.deepEqual(read, { ok: false, reason: "INVALID_INPUT", issues: [] });
  });

  it("reports an agenda that cannot be planned yet, with and without a proposal", async () => {
    const owner = (await client.user.create({ data: { email: "wk-noplan@test.invalid", passwordHash: "x" } })).id;
    for (const withProposal of [false, true]) {
      const read = await readWeek(owner, THIS_WEEK, depsWith(failingFetch), withProposal);
      assert.equal(read.ok, false);
      assert.equal(read.ok ? "" : read.reason, "NOT_PLANNABLE");
      assert.equal(read.ok ? "" : read.issues[0]?.reason, "NO_HOME");
    }
  });

  it("reads the stored planning without any IGN call", async () => {
    const owner = await seedOwner(client, "wk-noign@test.invalid");
    const urls: string[] = [];
    await addPerson(client, owner, "Jean Bonneau");
    const read = await readWeek(owner, THIS_WEEK, depsWith(recordingFetch(urls)), false);
    assert.equal(read.ok, true);
    assert.equal(read.ok ? read.proposal : "x", null);
    assert.deepEqual(urls, []);
  });

  it("returns the proposal, its fingerprint and the state when asked", async () => {
    const owner = await seedOwner(client, "wk-prop@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const urls: string[] = [];
    const read = await readWeek(owner, THIS_WEEK, depsWith(recordingFetch(urls)), true);
    assert.ok(read.ok && read.proposal !== null);
    assert.equal(read.proposal.fingerprint.length, 32);
    assert.equal(read.state.today, "2026-10-19");
    assert.ok(urls.length > 0, "road times are asked to IGN for a proposal");
  });
});

describe("buildWeekView: the stored planning", () => {
  it("lists the seven days with French labels, off days, lunch, and no tour figures", async () => {
    const owner = await seedOwner(client, "wk-days@test.invalid");
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.equal(view.days.length, 7);
    assert.equal(view.days[0].label, "Lundi 19 octobre");
    assert.equal(view.days[6].label, "Dimanche 25 octobre");
    assert.deepEqual(view.days.map((d) => d.offDay), [false, false, false, false, false, true, true]);
    assert.equal(view.days[0].isToday, true);
    assert.equal(view.days[1].isToday, false);
    assert.equal(view.days[1].isPast, false);
    assert.equal(view.proposal, null);
    assert.ok(view.days.every((d) => d.km === null && d.finishMin === null && !d.unreachable));
    const lunch = entriesOf(view, "2026-10-20").filter((e) => e.source === "LUNCH");
    assert.deepEqual(lunch.map((e) => [e.title, e.start, e.end, e.itemKey, e.kind]), [["Pause déjeuner", 750, 810, null, "BLOCK"]]);
  });

  it("shows validated items to come as VALIDATED, once, with their person and place", async () => {
    const owner = await seedOwner(client, "wk-validated@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-21`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-21", start: 600 });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    const [visit, ...rest] = bySource(view, "VALIDATED");
    assert.equal(rest.length, 0);
    assert.equal(visit.itemKey, `${jean}@2026-10-21`);
    assert.equal(visit.subtitle, "Domicile");
    assert.equal(visit.canMove, false);
    assert.equal(visit.canSkip, false);
    assert.equal(visit.canMarkMissed, false);
    assert.equal(visit.date, "2026-10-21");
  });

  it("shows past validated items as DONE (missable) and missed ones as MISSED", async () => {
    const owner = await seedOwner(client, "wk-past@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-14`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-14", start: 600 });
    await insertItem(client, owner, { itemKey: "MISSED:abc", contactId: jean, title: "Visite manquée", date: "2026-10-15", start: 600, status: "MISSED" });
    const view = await weekViewOf(owner, LAST_WEEK, false);
    const [done] = bySource(view, "DONE");
    const [missed] = bySource(view, "MISSED");
    assert.equal(done.canMarkMissed, true);
    assert.equal(missed.title, "Visite manquée");
    assert.equal(missed.subtitle, "Jean Bonneau");
    assert.equal(missed.canMarkMissed, false);
    assert.ok(view.days.every((d) => d.isPast));
  });

  it("marks today's item as VALIDATED but already missable", async () => {
    const owner = await seedOwner(client, "wk-today@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-19`, contactId: jean, title: "Visite du jour", date: "2026-10-19", start: 540 });
    const [item] = bySource(await weekViewOf(owner, THIS_WEEK, false), "VALIDATED");
    assert.equal(item.canMarkMissed, true);
  });

  it("shows unavailability, its place, and closures with their label", async () => {
    const owner = await seedOwner(client, "wk-rules@test.invalid");
    await addUnavailable(client, owner, { label: "Permanence au bureau", dow: 2, allDay: false, fromMin: 840, toMin: 960, atOffice: true });
    await addUnavailable(client, owner, { label: "Médecin", dow: 3, allDay: false, fromMin: 840, toMin: 900 });
    await addUnavailable(client, owner, { label: "Journée au bureau", dow: 5 });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    const busy = bySource(view, "BUSY").map((e) => [e.title, e.subtitle, e.start, e.end]);
    assert.deepEqual(busy, [["Permanence au bureau", "Au bureau", 840, 960], ["Médecin", "Indisponible", 840, 900]]);
    assert.equal(view.days[4].closedLabel, "Journée au bureau");
    assert.equal(view.days[0].closedLabel, null);
  });

  it("falls back on « Indisponible » for a closure without a label", async () => {
    const owner = await seedOwner(client, "wk-closed@test.invalid");
    await client.agendaRule.create({ data: { ownerId: owner, type: "VACATION", label: "", strength: "HARD", fromDate: new Date("2026-10-21T00:00:00Z"), toDate: new Date("2026-10-21T00:00:00Z") } });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.equal(view.days[2].closedLabel, "Indisponible");
  });

  it("keeps the default 07:30–20:30 grid and the end-of-day lines of the settings", async () => {
    const owner = await seedOwner(client, "wk-grid@test.invalid");
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.deepEqual(view.grid, { from: 450, to: 1230, dayEnd: 1080, dayEndLimit: 1140 });
  });

  it("widens the grid for an early and a late entry, by half-hours", async () => {
    const owner = await seedOwner(client, "wk-wide@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-20`, contactId: jean, title: "Tôt", date: "2026-10-20", start: 400 });
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-21`, contactId: jean, title: "Tard", date: "2026-10-21", start: 1250 });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.equal(view.grid.from, 390);
    assert.equal(view.grid.to, 1320);
  });

  it("widens the grid for a strict limit past 20:30", async () => {
    const owner = await seedOwner(client, "wk-limit@test.invalid", { ...(await import("./bridge-fixtures")).SETTINGS, dayEndMinutes: 1200, dayEndLimitMinutes: 1300 });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.equal(view.grid.to, 1320);
    assert.equal(view.grid.dayEndLimit, 1300);
  });

  it("lists the rows the agenda could not use as issues, without names", async () => {
    const owner = await seedOwner(client, "wk-issues@test.invalid");
    await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: null });
    await addPerson(client, owner, "Aude Javel", { lastVisitOn: null });
    const view = await weekViewOf(owner, THIS_WEEK, false);
    assert.equal(view.issues.length, 1);
    assert.match(view.issues[0].message, /^2 personnes sans date de dernière visite/);
    assert.ok(!JSON.stringify(view.issues).includes("Jean"));
  });
});

describe("buildWeekView: a proposal", () => {
  it("proposes the overdue visits with their occurrence key and the totals", async () => {
    const owner = await seedOwner(client, "wk-proposal@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await addPerson(client, owner, "Aude Javel", { address: TOURCOING });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    const proposed = bySource(view, "PROPOSED");
    assert.equal(proposed.length, 2);
    const visit = proposed.find((e) => e.itemKey?.startsWith(jean));
    assert.ok(visit);
    assert.equal(visit.occurrenceKey, visit.itemKey);
    assert.match(visit.occurrenceKey ?? "", /^[a-z0-9]{20,40}@\d{4}-\d{2}-\d{2}$/);
    assert.equal(visit.canSkip, true);
    assert.equal(visit.canMove, true);
    assert.equal(visit.canMarkMissed, false);
    assert.equal(visit.kind, "VISIT");
    assert.equal(visit.title, "Visite à Jean Bonneau");
    assert.ok(visit.priority !== null);
    assert.ok(view.proposal);
    assert.equal(view.proposal.placedCount, 2);
    assert.equal(view.proposal.estimatedRouteCount, 0);
    assert.ok(view.proposal.totalKm > 0);
    assert.equal(view.proposal.fingerprint.length, 32);
    const tours = view.days.filter((d) => d.km !== null);
    assert.ok(tours.length >= 1 && tours.every((d) => (d.finishMin ?? 0) > 0));
  });

  it("flags road times estimated when IGN did not answer", async () => {
    const owner = await seedOwner(client, "wk-estimated@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const read = await readWeek(owner, THIS_WEEK, depsWith(failingFetch), true);
    assert.ok(read.ok && read.proposal);
    assert.ok(read.proposal.estimated.length > 0);
    const view = (await import("../views/week-view")).buildWeekView({ state: read.state, ...THIS_WEEK, proposal: read.proposal, issues: read.issues });
    assert.ok((view.proposal?.estimatedRouteCount ?? 0) > 0);
  });

  it("does not propose a visit skipped with « Pas cette fois »", async () => {
    const owner = await seedOwner(client, "wk-skip@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const first = bySource(await weekViewOf(owner, THIS_WEEK, true), "PROPOSED")[0];
    assert.ok(first.occurrenceKey);
    assert.deepEqual(await setOccurrence(owner, first.occurrenceKey, { skipped: true }, NOW), { ok: true });
    const again = await weekViewOf(owner, THIS_WEEK, true);
    assert.equal(bySource(again, "PROPOSED").filter((e) => e.itemKey?.startsWith(jean) && e.itemKey === first.itemKey).length, 0);
  });

  it("shows a fixed-time appointment as FIXED, not movable, and once after validation", async () => {
    const owner = await seedOwner(client, "wk-fixed@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await addAppointmentRow(owner, { title: "Audience au tribunal", participantIds: [jean], when: { kind: "FIXED", date: "2026-10-21", timeMin: 840 } });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    const [fixed] = bySource(view, "FIXED");
    assert.equal(fixed.title, "Audience au tribunal");
    assert.deepEqual([fixed.start, fixed.end, fixed.canMove, fixed.canSkip, fixed.occurrenceKey], [840, 900, false, false, null]);
    assert.equal(fixed.subtitle, "Jean Bonneau · Bureau");
    const proposed = await readWeek(owner, THIS_WEEK, depsWith(recordingFetch([])), true);
    assert.ok(proposed.ok && proposed.proposal);
    await validatePeriod(owner, THIS_WEEK, proposed.proposal.fingerprint, depsWith(recordingFetch([])));
    const after = await weekViewOf(owner, THIS_WEEK, true);
    assert.equal(allEntries(after).filter((e) => e.title === "Audience au tribunal").length, 1);
    assert.equal(bySource(after, "FIXED").length, 0);
    assert.equal(bySource(after, "VALIDATED").filter((e) => e.title === "Audience au tribunal").length, 1);
  });

  it("shows a block placed by hand as PINNED, movable, with the warning of its position", async () => {
    const owner = await seedOwner(client, "wk-pinned@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const first = bySource(await weekViewOf(owner, THIS_WEEK, true), "PROPOSED")[0];
    assert.ok(first.itemKey);
    assert.deepEqual(await pinBlock(owner, first.itemKey, { date: "2026-10-24", start: 600 }, NOW), { ok: true });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    const [pinned] = bySource(view, "PINNED");
    assert.equal(pinned.itemKey, first.itemKey);
    assert.equal(pinned.date, "2026-10-24");
    assert.equal(pinned.warning, "CLOSED_DAY");
    assert.deepEqual([pinned.canMove, pinned.canSkip, pinned.occurrenceKey], [true, false, null]);
    assert.equal(bySource(view, "PROPOSED").filter((e) => e.itemKey === first.itemKey).length, 0);
  });

  it("gives a pinned block without a problem no warning", async () => {
    const owner = await seedOwner(client, "wk-pinok@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const first = bySource(await weekViewOf(owner, THIS_WEEK, true), "PROPOSED")[0];
    assert.ok(first.itemKey);
    await pinBlock(owner, first.itemKey, { date: "2026-10-22", start: 600 }, NOW);
    const [pinned] = bySource(await weekViewOf(owner, THIS_WEEK, true), "PINNED");
    assert.equal(pinned.warning, null);
  });

  it("reports what cannot be placed, with the name of the visit and as an alert when it is a must", async () => {
    const owner = await seedOwner(client, "wk-problems@test.invalid");
    await addPerson(client, owner, "Sophie Stiqué", { address: null });
    await addAppointmentRow(owner, { title: "Rendez-vous urgent", priority: "MUST", durationMin: 60, when: { kind: "WEEK", from: "2026-10-26", to: "2026-10-30" } });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    assert.ok(view.proposal);
    const noAddress = view.proposal.problems.find((p) => p.reason === "NO_ADDRESS");
    assert.deepEqual([noAddress?.title, noAddress?.isAlert, noAddress?.lateDays], ["Visite à Sophie Stiqué", false, null]);
  });

  it("marks an unplaced must-do as an alert", async () => {
    const owner = await seedOwner(client, "wk-alert@test.invalid");
    for (const dow of [1, 2, 3, 4, 5]) await addUnavailable(client, owner, { label: "Congé", dow });
    await addAppointmentRow(owner, { title: "À ne pas rater", priority: "MUST", when: { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" } });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    const alert = view.proposal?.problems.find((p) => p.title === "À ne pas rater");
    assert.deepEqual([alert?.isAlert, alert?.priority, alert?.reason], [true, "MUST", "NO_COMMON_SLOT"]);
    assert.ok(view.days.slice(0, 5).every((d) => d.closedLabel === "Congé"));
  });

  it("asks an « Important » question when breaking the rule places more, then reads the answer back", async () => {
    const owner = await seedOwner(client, "wk-question@test.invalid");
    const ruleId = await addUnavailable(client, owner, { label: "Mercredi : enfants", strength: "STRONG", dow: 3 });
    for (const dow of [1, 2, 4, 5]) await addUnavailable(client, owner, { label: "Jour fermé", dow });
    await addAppointmentRow(owner, { title: "Seul créneau possible", priority: "HIGH", when: { kind: "WEEK", from: "2026-10-19", to: "2026-10-23" } });
    const view = await weekViewOf(owner, THIS_WEEK, true);
    const question = view.proposal?.questions[0];
    assert.ok(question, "breaking the only open day should be worth a question");
    assert.deepEqual([question.ruleKey, question.label, question.strength, question.answer], [ruleId, "Mercredi : enfants", "STRONG", null]);
    assert.equal(question.placesMore, question.exception.placed - question.respect.placed);
    assert.ok(question.placesMore >= 1);
    assert.ok(question.exception.unplaced < question.respect.unplaced);
    await client.agendaRuleAnswer.create({ data: { ownerId: owner, ruleKey: ruleId, answer: "BREAK" } });
    const answered = await weekViewOf(owner, THIS_WEEK, true);
    assert.equal(answered.proposal?.questions[0]?.answer, "break");
    assert.equal(bySource(answered, "PROPOSED").filter((e) => e.title === "Seul créneau possible").length, 1);
  });
});
