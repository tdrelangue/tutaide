// The demo account's agenda must be presentable whatever day the demo starts: a question to answer,
// appointments to place, a closed day, and a validated last week to confirm.
import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, describe, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedDemoAccount } from "@/lib/demo/seed";
import { listAppointments } from "../appointments";
import { itemsToConfirm } from "../bridge/ops/missed";
import { readWeek } from "../bridge/ops/week";
import { buildVisitStatus } from "../views/visit-status";
import { loadPlannerState } from "../bridge/load";
import { buildWeekView } from "../views/week-view";
import type { EntryView, WeekView } from "../views/types";
import { createTestDb, createUser } from "./db";
import { depsWith, recordingFetch } from "./bridge-fixtures";

let client: PrismaClient;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ client, close } = await createTestDb());
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.setSystemTime(vi.getRealSystemTime()));
afterAll(async () => {
  vi.useRealTimers();
  await close();
});

/** Demo starts: every weekday, and a Sunday, at 09:00 Paris. */
const STARTS = [
  ["Monday", "2026-10-19T07:00:00Z", "2026-10-26"],
  ["Wednesday", "2026-10-21T07:00:00Z", "2026-10-26"],
  ["Friday", "2026-10-23T07:00:00Z", "2026-10-26"],
  ["Sunday", "2026-10-25T08:00:00Z", "2026-10-26"],
] as const;

const entries = (view: WeekView, source: EntryView["source"]): EntryView[] => view.days.flatMap((d) => d.entries).filter((e) => e.source === source);

async function demoAt(isoNow: string, email: string) {
  const now = new Date(isoNow);
  vi.setSystemTime(now);
  const ownerId = await createUser(client, email);
  await seedDemoAccount(ownerId);
  return { ownerId, now };
}

async function nextWeekView(ownerId: string, now: Date, nextMonday: string): Promise<WeekView> {
  const to = new Date(`${nextMonday}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 6);
  const period = { from: nextMonday, to: to.toISOString().slice(0, 10) };
  const read = await readWeek(ownerId, period, { ...depsWith(recordingFetch([])), now }, true);
  if (!read.ok) throw new Error(`demo agenda should be plannable, got ${read.reason}`);
  return buildWeekView({ state: read.state, ...period, proposal: read.proposal, issues: read.issues });
}

describe("the demo agenda", () => {
  for (const [name, isoNow, nextMonday] of STARTS) {
    it(`gives a presentable next week when the demo starts on a ${name}`, async () => {
      const { ownerId, now } = await demoAt(isoNow, `demo-${name}@test.invalid`);
      const view = await nextWeekView(ownerId, now, nextMonday);
      assert.ok(view.proposal, "a proposal is computed");
      assert.ok(entries(view, "PROPOSED").length >= 4, "visits are proposed");
      assert.equal(entries(view, "FIXED").map((e) => e.title).join(), "Audience au tribunal");
      assert.ok(view.proposal.questions.length >= 1, "an « Important » question is asked");
      assert.equal(view.proposal.questions[0].label, "Mercredi après-midi : enfants");
      assert.equal(view.days[4].closedLabel, "Journée au bureau");
      assert.ok(entries(view, "BUSY").some((e) => e.title === "Mercredi après-midi : enfants"));
      const [question] = view.proposal.questions;
      assert.ok(question.placesMore >= 1, "breaking the rule places the notary signature");
      assert.ok(view.proposal.problems.some((p) => p.title === "Signature chez le notaire" && p.reason === "NO_COMMON_SLOT"));
      assert.equal(view.proposal.problems.some((p) => p.reason === "NO_ADDRESS"), true, "Sophie Stiqué has no address on purpose");
      assert.match(view.issues.map((i) => i.message).join(" "), /2 personnes sans date de dernière visite/);
    });
  }

  it("places the notary signature on Wednesday afternoon once the user agrees to the exception", async () => {
    const { ownerId, now } = await demoAt("2026-10-21T07:00:00Z", "demo-break@test.invalid");
    const rule = await client.agendaRule.findFirstOrThrow({ where: { ownerId, strength: "STRONG" } });
    await client.agendaRuleAnswer.create({ data: { ownerId, ruleKey: rule.id, answer: "BREAK" } });
    const view = await nextWeekView(ownerId, now, "2026-10-26");
    const notary = [...entries(view, "PROPOSED"), ...entries(view, "PINNED")].find((e) => e.title === "Signature chez le notaire");
    assert.equal(notary?.date, "2026-10-28");
    assert.ok((notary?.start ?? 0) >= 840 && (notary?.end ?? 2000) <= 1020, "inside Alain's Wednesday availability");
  });

  it("has a validated last week to confirm, with a fixed appointment among them", async () => {
    const { ownerId, now } = await demoAt("2026-10-21T07:00:00Z", "demo-confirm@test.invalid");
    const outcome = await itemsToConfirm(ownerId, now);
    assert.ok(outcome.ok);
    const titles = outcome.ok ? outcome.items.map((i) => i.title) : [];
    assert.deepEqual([...titles].sort(), ["Rendez-vous à la banque", "Visite à Annie Versaire", "Visite à Jean Bonneau"]);
    assert.ok(outcome.ok && outcome.items.every((i) => i.date < "2026-10-21"));
  });

  it("lists the appointments with their status and place", async () => {
    const { ownerId, now } = await demoAt("2026-10-21T07:00:00Z", "demo-appointments@test.invalid");
    const rows = await listAppointments(ownerId, now);
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    assert.deepEqual(
      [byTitle["Signature chez le notaire"].status, byTitle["Signature chez le notaire"].placeLabel, byTitle["Signature chez le notaire"].participantNames],
      ["A_PLACER", "Étude de Maître Tabellion", ["Alain Térieur"]],
    );
    assert.deepEqual([byTitle["Audience au tribunal"].status, byTitle["Audience au tribunal"].when.kind], ["A_PLACER", "FIXED"]);
    assert.equal(byTitle["Rendez-vous à la banque"].status, "FAIT");
  });

  it("shows a visit status per person, Jean seen last week and Pierre never seen", async () => {
    const { ownerId, now } = await demoAt("2026-10-21T07:00:00Z", "demo-status@test.invalid");
    const loaded = await loadPlannerState(ownerId, now);
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    const rows = buildVisitStatus(loaded.state, loaded.issues);
    const name = (id: string) => loaded.state.contacts.find((c) => c.id === id)?.name;
    const seen = Object.fromEntries(rows.map((r) => [name(r.personId), r.seenOn]));
    assert.equal(seen["Jean Bonneau"], "2026-10-16");
    assert.equal(seen["Pierre Kiroul"], null);
    assert.ok(seen["Aude Javel"]);
  });
});
