// Run: npx tsx scripts/tests/access-scope.test.ts
import assert from "node:assert/strict";
import {
  canWorkOnDossiers,
  resolveOwnerIds,
  type Actor,
  type AssignedMandataire,
} from "../../src/lib/access/scope";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const ORG = "org1";
const mjpm = (id: string, extra: Partial<AssignedMandataire> = {}): AssignedMandataire => ({
  id, orgId: ORG, orgRole: "MANDATAIRE", archived: false, ...extra,
});
const actor = (extra: Partial<Actor>): Actor => ({
  id: "me", orgId: ORG, orgRole: null, isOrgAdmin: false, ...extra,
});

check("solo account: only its own dossiers (unchanged behaviour)", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgId: null }), []), ["me"]);
});

check("MJPM: only their own dossiers, even with a selection", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "MANDATAIRE" }), [mjpm("a")], "a"), ["me"]);
});

check("assistant: every assigned MJPM by default", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), [mjpm("a"), mjpm("b")]), ["a", "b"]);
});

check("assistant: narrowed to the chosen MJPM", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), [mjpm("a"), mjpm("b")], "b"), ["b"]);
});

check("assistant: a selection they are not assigned to falls back to their own list", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), [mjpm("a")], "stranger"), ["a"]);
});

check("assistant: MJPM of another organisation is ignored", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), [mjpm("a"), mjpm("x", { orgId: "org2" })]), ["a"]);
});

check("assistant: archived MJPM, or one no longer an MJPM, is ignored", () => {
  const assigned = [mjpm("a", { archived: true }), mjpm("b", { orgRole: "ASSISTANT" }), mjpm("c")];
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), assigned), ["c"]);
});

check("assistant with nobody assigned: no dossiers", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "ASSISTANT" }), []), []);
});

check("admin-only account (IT): no dossiers, cannot work on dossiers", () => {
  const it = actor({ orgRole: null, isOrgAdmin: true });
  assert.deepEqual(resolveOwnerIds(it, [mjpm("a")]), []);
  assert.equal(canWorkOnDossiers(it), false);
});

check("MJPM + admin right: own dossiers; the admin right adds nothing", () => {
  assert.deepEqual(resolveOwnerIds(actor({ orgRole: "MANDATAIRE", isOrgAdmin: true }), [mjpm("a")]), ["me"]);
});

console.log(`\n${passed} checks passed`);
