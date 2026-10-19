// BridgeIssue -> IssueView: plain French, never a name or an id, aggregated by reason.
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { makeIssue } from "../bridge/issues";
import { toIssueViews } from "../views/issue-messages";

describe("toIssueViews", () => {
  it("sends settings problems to the settings tab", () => {
    const views = toIssueViews([makeIssue("settings", "none", "NO_HOME"), makeIssue("settings", "s1", "NO_WORK_DAYS"), makeIssue("settings", "s1", "BAD_TIMEZONE")]);
    assert.deepEqual(views.map((v) => [v.kind, v.fixTab]), [["NO_HOME", "parametres"], ["NO_WORK_DAYS", "parametres"], ["BAD_TIMEZONE", "parametres"]]);
    assert.match(views[0].message, /domicile/i);
  });

  it("sends contact problems to the persons tab", () => {
    const views = toIssueViews([makeIssue("contact", "c1", "VISITS_INVALID"), makeIssue("contact", "c2", "BAD_AVAILABILITY")]);
    assert.ok(views.every((v) => v.fixTab === "personnes"));
  });

  it("aggregates the unknown last visits in one informational message", () => {
    const views = toIssueViews([1, 2, 3].map((n) => makeIssue("contact", `c${n}`, "LAST_VISIT_UNKNOWN")));
    assert.equal(views.length, 1);
    assert.match(views[0].message, /^3 personnes sans date de dernière visite/);
    assert.match(views[0].message, /proposée dès maintenant/);
  });

  it("uses the singular for one row", () => {
    const [view] = toIssueViews([makeIssue("contact", "c1", "LAST_VISIT_UNKNOWN")]);
    assert.match(view.message, /^1 personne sans date de dernière visite : la visite est proposée dès maintenant/);
  });

  it("never echoes a row id", () => {
    const secret = "cmabcdefghijklmnopqrstu";
    const views = toIssueViews([makeIssue("appointment", secret, "BAD_WHEN"), makeIssue("rule", secret, "BAD_RULE"), makeIssue("pin", secret, "PARTICIPANT_UNKNOWN")]);
    assert.ok(views.every((v) => !v.message.includes(secret)));
  });

  it("covers every reason the mappers can report", () => {
    const reasons: [Parameters<typeof makeIssue>[0], string][] = [
      ["contact", "VISITS_INCOMPLETE"], ["contact", "PREF_DAY_INVALID"], ["rule", "UNSUPPORTED_RULE"], ["rule", "BAD_RULE"],
      ["appointment", "PLACE_MISSING"], ["appointment", "BAD_WHEN"], ["place", "PLACE_NO_POINT"], ["pin", "PARTICIPANT_UNKNOWN"], ["override", "BAD_KEY"],
    ];
    const views = toIssueViews(reasons.map(([k, r]) => makeIssue(k, "x", r)));
    assert.equal(views.length, reasons.length);
    assert.ok(views.every((v) => v.message.length > 10));
    assert.equal(views.find((v) => v.kind === "BAD_WHEN")?.fixTab, "rendez-vous");
  });

  it("pluralises the aggregated messages", () => {
    const [view] = toIssueViews([makeIssue("rule", "a", "BAD_RULE"), makeIssue("rule", "b", "BAD_RULE")]);
    assert.match(view.message, /^2 règles/);
  });

  it("falls back on a generic message for an unknown reason", () => {
    const [view] = toIssueViews([makeIssue("item", "i", "WHATEVER")]);
    assert.match(view.message, /ignorée/i);
    assert.equal(view.fixTab, null);
  });

  it("returns nothing for no issue", () => {
    assert.deepEqual(toIssueViews([]), []);
  });
});
