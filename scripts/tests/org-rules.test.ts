// Run: npx tsx scripts/tests/org-rules.test.ts
import assert from "node:assert/strict";
import {
  refuseAssignment,
  refuseMemberChange,
  refuseProtectedAccount,
  refuseSelfGrant,
  type MemberState,
} from "../../src/lib/organizations/rules";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const m = (id: string, extra: Partial<MemberState> = {}): MemberState => ({
  id, orgRole: null, isOrgAdmin: false, archived: false, ...extra,
});

check("the last active admin cannot lose the admin right", () => {
  const members = [m("it", { isOrgAdmin: true }), m("a", { orgRole: "MANDATAIRE" })];
  assert.match(refuseMemberChange(members, "it", { isOrgAdmin: false }, 0) ?? "", /au moins un administrateur/);
});

check("the last active admin cannot be archived", () => {
  const members = [m("it", { isOrgAdmin: true })];
  assert.ok(refuseMemberChange(members, "it", { archived: true }, 0));
});

check("an admin can step down when another admin remains", () => {
  const members = [m("it", { isOrgAdmin: true }), m("boss", { isOrgAdmin: true, orgRole: "MANDATAIRE" })];
  assert.equal(refuseMemberChange(members, "it", { isOrgAdmin: false }, 0), null);
});

check("an archived admin does not count as the remaining one", () => {
  const members = [m("it", { isOrgAdmin: true }), m("old", { isOrgAdmin: true, archived: true })];
  assert.ok(refuseMemberChange(members, "it", { isOrgAdmin: false }, 0));
});

check("an MJPM with dossiers keeps the role until they are transferred", () => {
  const members = [m("boss", { isOrgAdmin: true }), m("a", { orgRole: "MANDATAIRE" })];
  assert.match(refuseMemberChange(members, "a", { orgRole: "ASSISTANT" }, 3) ?? "", /3 dossier/);
  assert.ok(refuseMemberChange(members, "a", { archived: true }, 1));
  assert.equal(refuseMemberChange(members, "a", { orgRole: "ASSISTANT" }, 0), null);
});

check("giving the admin right to an IT account (no working role) is allowed", () => {
  const members = [m("boss", { isOrgAdmin: true }), m("it")];
  assert.equal(refuseMemberChange(members, "it", { isOrgAdmin: true }, 0), null);
});

check("assignments only link an active assistant to an active MJPM", () => {
  const assistant = m("s", { orgRole: "ASSISTANT" });
  const mjpm = m("a", { orgRole: "MANDATAIRE" });
  assert.equal(refuseAssignment(assistant, mjpm), null);
  assert.ok(refuseAssignment(mjpm, assistant));
  assert.ok(refuseAssignment(m("it", { isOrgAdmin: true }), mjpm), "an admin-only account is never an assistant");
  assert.ok(refuseAssignment(assistant, m("x", { orgRole: "MANDATAIRE", archived: true })));
  assert.ok(refuseAssignment(undefined, mjpm), "someone outside the organisation");
});

check("an admin cannot change their own role or grant themselves MJPMs/dossiers", () => {
  assert.ok(refuseSelfGrant("it", "it", { orgRole: "ASSISTANT" }));
  assert.ok(refuseSelfGrant("it", "it"));
  assert.equal(refuseSelfGrant("it", "sophie", { orgRole: "ASSISTANT" }), null);
});

check("the platform super-admin account is never managed by an organisation", () => {
  assert.ok(refuseProtectedAccount("ADMIN"));
  assert.equal(refuseProtectedAccount("USER"), null);
});

console.log(`\n${passed} checks passed`);
