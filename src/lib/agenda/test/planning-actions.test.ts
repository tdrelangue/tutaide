// The /agenda planning actions, called directly: input checks, outcome messages, and the happy paths on PGlite.
import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const session = vi.hoisted(() => ({ owner: null as { ownerId: string; actorId: string } | null, error: null as unknown }));

vi.mock("@/lib/agenda/context", () => {
  class AgendaAccessError extends Error {}
  return {
    AgendaAccessError,
    requireAgendaOwner: async () => {
      if (session.error !== null) throw session.error;
      if (session.owner === null) throw new AgendaAccessError("Le module Agenda n'est pas activé pour ce compte.");
      return session.owner;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { AgendaAccessError } from "@/lib/agenda/context";
import {
  addAppointment, answerQuestion, applyInsertMoves, getItemsToConfirm, getVisitStatus, getWeek, listAppointments, markMissed, pinItem,
  placeInSlot, previewInsertMoves, proposeWeek, refuseException, removeAppointment, skipOccurrence, unpinItem, validateWeek,
} from "@/app/(app)/agenda/planning-actions";
import type { AgendaDataResult, EntryView, InsertView, WeekView } from "../views/types";
import { createTestDb } from "./db";
import { NOW, addPerson, insertItem, seedOwner } from "./bridge-fixtures";
import { addAppointmentRow, addUnavailable } from "./views-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;
const MONDAY = "2026-10-19";
const SUNDAY = "2026-10-25";
const ROUTE_ANSWER = { distance: 8, duration: 14, distanceUnit: "kilometer", timeUnit: "minute" };

beforeAll(async () => {
  ({ client, close } = await createTestDb());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ROUTE_ANSWER }));
});
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await close();
});
afterEach(() => {
  session.error = null;
  vi.mocked(revalidatePath).mockClear();
});

/** Tests pass inputs the types forbid, on purpose: that is what the checks are for. */
const invalid = (value: unknown): never => value as never;

async function signedIn(email: string): Promise<string> {
  const ownerId = await seedOwner(client, email);
  session.owner = { ownerId, actorId: ownerId };
  return ownerId;
}

function ok<T>(result: AgendaDataResult<T>): T {
  if (!result.success) throw new Error(`expected success, got: ${result.error}`);
  return result.data;
}

function error<T>(result: AgendaDataResult<T>): string {
  if (result.success) throw new Error("expected a failure");
  return result.error;
}

const entries = (view: WeekView, source: EntryView["source"]) => view.days.flatMap((d) => d.entries).filter((e) => e.source === source);

describe("access and unexpected errors", () => {
  it("returns the access message when the module is not available", async () => {
    session.owner = null;
    assert.equal(error(await getWeek(MONDAY)), "Le module Agenda n'est pas activé pour ce compte.");
    assert.equal(error(await listAppointments()), "Le module Agenda n'est pas activé pour ce compte.");
  });

  it("hides an unexpected error behind a generic message", async () => {
    await signedIn("act-boom@test.invalid");
    session.error = new Error("connection to db.prisma.io failed for jean.bonneau@exemple.fr");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message = error(await getVisitStatus());
    spy.mockRestore();
    assert.match(message, /^Erreur inattendue/);
    assert.ok(!message.includes("prisma"));
  });
});

describe("input checks", () => {
  const cases: [string, () => Promise<AgendaDataResult<unknown>>, RegExp][] = [
    ["a week start that is not a date", () => getWeek("nope"), /^Date invalide\.$/],
    ["a week start that is not a string", () => getWeek(invalid(42)), /^Date invalide\.$/],
    ["an impossible day", () => getWeek("2026-02-31"), /^Date invalide\.$/],
    ["a week longer than seven days", () => proposeWeek(MONDAY, "2026-10-30"), /^Période invalide/],
    ["a week that ends before it starts", () => proposeWeek("2026-10-21", "2026-10-18"), /^Période invalide/],
    ["an end date that is not a date", () => validateWeek(MONDAY, "x", "f".repeat(32)), /^Date invalide\.$/],
    ["an empty fingerprint", () => validateWeek(MONDAY, SUNDAY, ""), /^Proposition invalide/],
    ["a fingerprint that is too long", () => validateWeek(MONDAY, SUNDAY, "f".repeat(65)), /^Proposition invalide/],
    ["a pin start after the last minute", () => pinItem("k", "2026-10-21", 5000), /^Horaire invalide\.$/],
    ["a fractional pin start", () => pinItem("k", "2026-10-21", 600.5), /^Horaire invalide\.$/],
    ["a pin on an impossible day", () => pinItem("k", "2026-02-31", 600), /^Date invalide\.$/],
    ["an item key that is too long", () => pinItem("k".repeat(121), "2026-10-21", 600), /^Élément introuvable\.$/],
    ["an empty item key", () => unpinItem(""), /^Élément introuvable\.$/],
    ["an answer other than respect, break or null", () => answerQuestion("r", invalid("maybe")), /^Réponse invalide\.$/],
    ["a refusal that is not a boolean", () => refuseException("r", invalid("yes")), /^Valeur invalide\.$/],
    ["a skip that is not a boolean", () => skipOccurrence("k", invalid(1)), /^Valeur invalide\.$/],
    ["a missed window with bad dates", () => markMissed("k", { from: "x", to: "2026-10-30" }), /^Date invalide\.$/],
    ["an appointment id of the wrong shape", () => placeInSlot("nope", "2026-10-21", 600), /^Rendez-vous introuvable\.$/],
    ["a slot start that is not a number", () => placeInSlot("a".repeat(25), "2026-10-21", invalid("9h")), /^Horaire invalide\.$/],
    ["too many movable keys", () => previewInsertMoves("a".repeat(25), Array.from({ length: 101 }, (_, i) => `k${i}`)), /au plus/],
    ["movable keys that are not a list", () => previewInsertMoves("a".repeat(25), invalid("k")), /^Sélection invalide\.$/],
    ["an apply without confirmation flag", () => applyInsertMoves("a".repeat(25), [], "f".repeat(32), invalid(undefined)), /^Valeur invalide\.$/],
    ["a removal with a bad id", () => removeAppointment("../x"), /^Rendez-vous introuvable\.$/],
    ["an appointment that is not an appointment", () => addAppointment(invalid({ title: "x" })), /./],
    ["no appointment at all", () => addAppointment(invalid(null)), /./],
  ];

  for (const [name, call, expected] of cases) {
    it(`refuses ${name}, writing nothing`, async () => {
      await signedIn(`act-input-${name.replace(/\W+/g, "-")}@test.invalid`);
      assert.match(error(await call()), expected);
      assert.equal(vi.mocked(revalidatePath).mock.calls.length, 0);
    });
  }
});

describe("an agenda that cannot be planned yet", () => {
  it("answers with the reason and where to fix it, for each screen", async () => {
    const ownerId = (await client.user.create({ data: { email: "act-noplan@test.invalid", passwordHash: "x" } })).id;
    session.owner = { ownerId, actorId: ownerId };
    const results = [await getWeek(MONDAY), await proposeWeek(MONDAY, SUNDAY), await getItemsToConfirm(), await getVisitStatus()];
    for (const result of results) {
      assert.equal(result.success, false);
      assert.match(result.success ? "" : result.error, /complétez les paramètres/);
      const issues = result.success ? [] : (result.issues ?? []);
      assert.deepEqual(issues.map((i) => [i.kind, i.fixTab]), [["NO_HOME", "parametres"]]);
    }
  });

  it("refuses a pin, an answer and a skip with the same explanation", async () => {
    const ownerId = (await client.user.create({ data: { email: "act-noplan2@test.invalid", passwordHash: "x" } })).id;
    session.owner = { ownerId, actorId: ownerId };
    const pinned = await pinItem("k", "2026-10-21", 600);
    assert.match(error(pinned), /complétez les paramètres/);
    const missed = await markMissed("k");
    assert.match(error(missed), /complétez les paramètres/);
  });
});

describe("the week", () => {
  it("snaps any day to its Monday and reads the stored planning without a proposal", async () => {
    const owner = await signedIn("act-week@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-21`, contactId: jean, title: "Visite à Jean Bonneau", date: "2026-10-21", start: 600 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const view = ok(await getWeek("2026-10-22"));
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ROUTE_ANSWER }));
    assert.deepEqual([view.from, view.to, view.proposal, view.today], [MONDAY, SUNDAY, null, MONDAY]);
    assert.equal(entries(view, "VALIDATED").length, 1);
    assert.equal(fetchSpy.mock.calls.length, 0, "IGN is never asked for the stored planning");
    assert.equal(vi.mocked(revalidatePath).mock.calls.length, 0);
  });

  it("proposes, then validates the proposal that was seen and returns the stored planning", async () => {
    const owner = await signedIn("act-validate@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const proposed = ok(await proposeWeek("2026-10-21", SUNDAY));
    assert.ok(proposed.proposal);
    assert.equal(entries(proposed, "PROPOSED").length, 1);
    const result = await validateWeek(MONDAY, SUNDAY, proposed.proposal.fingerprint);
    const validated = ok(result);
    assert.match(result.success ? (result.message ?? "") : "", /^Semaine validée : 1 élément ajouté/);
    assert.equal(validated.proposal, null);
    assert.equal(entries(validated, "VALIDATED").length, 1);
    assert.deepEqual(vi.mocked(revalidatePath).mock.calls, [["/agenda"]]);
  });

  it("refuses to validate a proposal that is not the one computed now", async () => {
    const owner = await signedIn("act-stale@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const message = error(await validateWeek(MONDAY, SUNDAY, "0".repeat(32)));
    assert.match(message, /a changé depuis son affichage/);
    assert.equal(vi.mocked(revalidatePath).mock.calls.length, 0);
  });

  it("says nothing is new when the week is validated twice with the same plan", async () => {
    const owner = await signedIn("act-twice@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const first = ok(await proposeWeek(MONDAY, SUNDAY));
    ok(await validateWeek(MONDAY, SUNDAY, first.proposal?.fingerprint ?? ""));
    const again = ok(await proposeWeek(MONDAY, SUNDAY));
    const result = await validateWeek(MONDAY, SUNDAY, again.proposal?.fingerprint ?? "");
    assert.equal(result.success && result.message, "Rien de nouveau à valider.");
  });
});

describe("adjusting a proposal", () => {
  it("pins a proposed block, shows it pinned, then gives it back", async () => {
    const owner = await signedIn("act-pin@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const [first] = entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PROPOSED");
    assert.ok(first.itemKey);
    assert.deepEqual(ok(await pinItem(first.itemKey, "2026-10-22", 840)), { done: true });
    const [pinned] = entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PINNED");
    assert.deepEqual([pinned.date, pinned.start], ["2026-10-22", 840]);
    assert.deepEqual(ok(await unpinItem(first.itemKey)), { done: true });
    assert.equal(entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PINNED").length, 0);
    assert.match(error(await unpinItem(first.itemKey)), /plus placé à la main/);
    assert.ok(vi.mocked(revalidatePath).mock.calls.length >= 2);
  });

  it("explains a pin on something that is not proposed, or outside the horizon", async () => {
    const owner = await signedIn("act-pinbad@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    assert.match(error(await pinItem("nothing-here", "2026-10-22", 840)), /n'est plus dans la proposition/);
    assert.equal(error(await pinItem("nothing-here", "2025-01-01", 840)), "Valeur invalide.");
  });

  it("skips a proposed visit, once", async () => {
    const owner = await signedIn("act-skip@test.invalid");
    await addPerson(client, owner, "Jean Bonneau");
    const [first] = entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PROPOSED");
    assert.ok(first.occurrenceKey);
    assert.deepEqual(ok(await skipOccurrence(first.occurrenceKey, true)), { done: true });
    assert.equal(entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PROPOSED").some((e) => e.itemKey === first.itemKey), false);
    assert.deepEqual(ok(await skipOccurrence(first.occurrenceKey, false)), { done: true });
    assert.equal(entries(ok(await proposeWeek(MONDAY, SUNDAY)), "PROPOSED").some((e) => e.itemKey === first.itemKey), true);
  });

  it("explains a skip on a visit that does not exist", async () => {
    await signedIn("act-skipbad@test.invalid");
    assert.equal(error(await skipOccurrence("not-an-occurrence", true)), "Cette visite est introuvable.");
    assert.equal(error(await skipOccurrence(`${"a".repeat(25)}@2026-10-21`, true)), "Cette visite est introuvable.");
  });

  it("stores the answer to a question and the refusal of an exception, and asks again on null", async () => {
    const owner = await signedIn("act-answer@test.invalid");
    const rule = await addUnavailable(client, owner, { label: "Mercredi : enfants", strength: "STRONG", dow: 3 });
    assert.deepEqual(ok(await answerQuestion(rule, "break")), { done: true });
    assert.equal((await client.agendaRuleAnswer.findUniqueOrThrow({ where: { ownerId_ruleKey: { ownerId: owner, ruleKey: rule } } })).answer, "BREAK");
    assert.deepEqual(ok(await answerQuestion(rule, null)), { done: true });
    assert.equal((await client.agendaRuleAnswer.findUniqueOrThrow({ where: { ownerId_ruleKey: { ownerId: owner, ruleKey: rule } } })).answer, null);
    assert.deepEqual(ok(await refuseException(rule, true)), { done: true });
    assert.equal((await client.agendaRuleAnswer.findUniqueOrThrow({ where: { ownerId_ruleKey: { ownerId: owner, ruleKey: rule } } })).refused, true);
  });

  it("explains an answer about a rule that is not the owner's", async () => {
    const mine = await signedIn("act-answer-mine@test.invalid");
    const theirs = await seedOwner(client, "act-answer-theirs@test.invalid");
    const foreign = await addUnavailable(client, theirs, { label: "Secret", strength: "STRONG", dow: 3 });
    session.owner = { ownerId: mine, actorId: mine };
    assert.equal(error(await answerQuestion(foreign, "break")), "Cette règle n'existe plus.");
    assert.equal(await client.agendaRuleAnswer.count({ where: { ownerId: theirs } }), 0);
  });
});

describe("missed appointments", () => {
  it("marks a past visit as missed", async () => {
    const owner = await signedIn("act-missed@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-15`, contactId: jean, title: "Visite", date: "2026-10-15", start: 600 });
    assert.deepEqual(ok(await markMissed(`${jean}@2026-10-15`)), { requeued: false });
    assert.equal((await client.agendaItem.findFirstOrThrow({ where: { ownerId: owner } })).status, "MISSED");
    assert.match(error(await markMissed(`${jean}@2026-10-15`)), /introuvable ou déjà traité/);
  });

  it("places a missed appointment again in the window chosen", async () => {
    const owner = await signedIn("act-requeue@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const appt = await addAppointmentRow(owner, { title: "Rendez-vous manqué", participantIds: [jean], when: { kind: "FIXED", date: "2026-10-15", timeMin: 600 } });
    await insertItem(client, owner, { itemKey: appt, contactId: jean, kind: "APPT", appointmentId: appt, title: "Rendez-vous manqué", date: "2026-10-15", start: 600 });
    assert.deepEqual(ok(await markMissed(appt, { from: "2026-10-27", to: "2026-10-30" })), { requeued: true });
    const stored = await client.agendaAppointment.findUniqueOrThrow({ where: { id: appt } });
    assert.equal(stored.whenKind, "RANGE");
    assert.equal(stored.fromDate?.toISOString().slice(0, 10), "2026-10-27");
  });

  it("refuses an item still to come and a window in the past", async () => {
    const owner = await signedIn("act-missed-bad@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-22`, contactId: jean, title: "Visite", date: "2026-10-22", start: 600 });
    await insertItem(client, owner, { itemKey: `${jean}@2026-10-14`, contactId: jean, title: "Visite", date: "2026-10-14", start: 600 });
    assert.match(error(await markMissed(`${jean}@2026-10-22`)), /pas encore eu lieu/);
    assert.match(error(await markMissed(`${jean}@2026-10-14`, { from: "2026-10-01", to: "2026-10-05" })), /Période invalide/);
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner, status: "MISSED" } }), 0);
  });

  it("lists the validated items of the last seven days, oldest first, with their day", async () => {
    const owner = await signedIn("act-confirm@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau");
    for (const [date, start] of [["2026-10-17", 540], ["2026-10-14", 600], ["2026-10-19", 480], ["2026-10-10", 600], ["2026-10-21", 600]] as const) {
      await insertItem(client, owner, { itemKey: `${jean}@${date}`, contactId: jean, title: `V ${date}`, date, start });
    }
    const list = ok(await getItemsToConfirm());
    assert.deepEqual(list.map((e) => e.date), ["2026-10-14", "2026-10-17", "2026-10-19"]);
    assert.deepEqual(list.map((e) => e.source), ["DONE", "DONE", "VALIDATED"]);
    assert.ok(list.every((e) => e.canMarkMissed && e.itemKey !== null));
  });
});

describe("appointments", () => {
  const appointment = (over: Record<string, unknown> = {}) => ({
    title: "Signature chez le notaire", participantIds: [], place: { kind: "OFFICE" as const }, durationMin: 60, priority: "HIGH" as const,
    when: { kind: "WEEK" as const, from: MONDAY, to: "2026-10-23" }, ...over,
  });

  function inserting(view: InsertView) {
    if (view.kind !== "NEEDS_INSERT") throw new Error(`expected NEEDS_INSERT, got ${view.kind}`);
    return view;
  }

  async function validatedWeekOf(email: string) {
    const owner = await signedIn(email);
    const jean = await addPerson(client, owner, "Jean Bonneau");
    const proposed = ok(await proposeWeek(MONDAY, SUNDAY));
    ok(await validateWeek(MONDAY, SUNDAY, proposed.proposal?.fingerprint ?? ""));
    return { owner, jean };
  }

  it("lists a new appointment when its dates do not touch the validated plan", async () => {
    await signedIn("act-listed@test.invalid");
    const view = ok(await addAppointment(appointment({ when: { kind: "WEEK", from: "2026-11-02", to: "2026-11-06" } })));
    assert.equal(view.kind, "LISTED");
    assert.deepEqual(vi.mocked(revalidatePath).mock.calls, [["/agenda"]]);
    const rows = ok(await listAppointments());
    assert.deepEqual(rows.map((r) => [r.title, r.status, r.placeLabel]), [["Signature chez le notaire", "A_PLACER", "Bureau"]]);
  });

  it("creates nothing and says why when the agenda cannot be planned", async () => {
    const ownerId = (await client.user.create({ data: { email: "act-add-noplan@test.invalid", passwordHash: "x" } })).id;
    session.owner = { ownerId, actorId: ownerId };
    const view = ok(await addAppointment(appointment()));
    assert.equal(view.kind, "NOT_PLANNABLE");
    assert.equal(view.kind === "NOT_PLANNABLE" ? view.issues[0].fixTab : "", "parametres");
    assert.equal(await client.agendaAppointment.count({ where: { ownerId } }), 0);
    assert.equal(vi.mocked(revalidatePath).mock.calls.length, 0);
  });

  it("offers free slots and the validated items that may move when it touches the validated plan", async () => {
    await validatedWeekOf("act-touch@test.invalid");
    const view = inserting(ok(await addAppointment(appointment())));
    assert.ok(view.options.length >= 1);
    assert.ok(view.candidates.every((c) => !c.fixed && c.date > MONDAY));
  });

  it("places the appointment in an offered slot, once", async () => {
    const { owner } = await validatedWeekOf("act-slot@test.invalid");
    const view = inserting(ok(await addAppointment(appointment())));
    const slot = view.options[0];
    assert.deepEqual(ok(await placeInSlot(view.appointmentId, slot.date, slot.start)), { done: true });
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner, appointmentId: view.appointmentId } }), 1);
    assert.equal(error(await placeInSlot(view.appointmentId, slot.date, slot.start)).length > 0, true);
    const [row] = ok(await listAppointments()).filter((r) => r.id === view.appointmentId);
    assert.deepEqual([row.status, row.scheduledOn], ["PREVU", slot.date]);
  });

  it("refuses a slot that is not offered", async () => {
    await validatedWeekOf("act-badslot@test.invalid");
    const view = inserting(ok(await addAppointment(appointment())));
    assert.match(error(await placeInSlot(view.appointmentId, "2026-10-23", 1)), /n'est plus libre/);
  });

  it("previews the moves, and applies exactly the preview that was seen", async () => {
    const { owner } = await validatedWeekOf("act-moves@test.invalid");
    const view = inserting(ok(await addAppointment(appointment({ when: { kind: "FIXED", date: MONDAY, timeMin: 540 }, durationMin: 120 }))));
    const preview = ok(await previewInsertMoves(view.appointmentId, []));
    assert.ok(preview.placement !== null || preview.changes.length === 0);
    assert.match(error(await applyInsertMoves(view.appointmentId, [], "0".repeat(32), false)), /Le planning a changé depuis l'aperçu|Aucun créneau/);
    if (preview.placement === null) return;
    assert.deepEqual(ok(await applyInsertMoves(view.appointmentId, [], preview.fingerprint, false)), { done: true });
    assert.equal(await client.agendaItem.count({ where: { ownerId: owner, appointmentId: view.appointmentId } }), 1);
  });

  it("removes an appointment, and refuses one that is not the owner's", async () => {
    const mine = await signedIn("act-remove-mine@test.invalid");
    const theirs = await seedOwner(client, "act-remove-theirs@test.invalid");
    const foreign = await addAppointmentRow(theirs, { title: "Secret" });
    const own = await addAppointmentRow(mine, { title: "À supprimer" });
    assert.equal(error(await removeAppointment(foreign)), "Rendez-vous introuvable.");
    assert.equal(await client.agendaAppointment.count({ where: { id: foreign } }), 1);
    assert.deepEqual(ok(await removeAppointment(own)), { done: true });
    assert.deepEqual(ok(await listAppointments()), []);
    assert.equal(error(await removeAppointment(own)), "Rendez-vous introuvable.");
  });

  it("rejects a participant who is not the owner's with a clear message", async () => {
    await signedIn("act-add-foreign@test.invalid");
    const theirs = await seedOwner(client, "act-add-foreign2@test.invalid");
    const stranger = await addPerson(client, theirs, "Alain Térieur");
    assert.equal(error(await addAppointment(appointment({ participantIds: [stranger] }))), "Un des participants n'existe plus.");
  });
});

describe("visit status", () => {
  it("answers per protected person", async () => {
    const owner = await signedIn("act-status@test.invalid");
    const jean = await addPerson(client, owner, "Jean Bonneau", { lastVisitOn: "2026-09-01" });
    const rows = ok(await getVisitStatus());
    assert.deepEqual(rows, [{ personId: jean, seenOn: "2026-09-01", plannedOn: null, nextDue: "2026-10-01", paused: false }]);
  });
});
