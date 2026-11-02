import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";
import type { Tx } from "./bridge/lock";
import {
  DEFAULT_PARTNER_GROUPS,
  DEFAULT_PERSON_GROUP,
  MAX_GROUPS_PER_OWNER,
  groupOf,
  sameGroupName,
  toGroupColor,
  type GroupKindValue,
  type GroupTag,
} from "./groups-rules";
import type { AgendaGroupInput } from "./validation";

/**
 * « Agenda » groups (Thomas, 2026-11-02): coloured, one per contact, made by
 * the user. Groups of persons belong to the MJPM; groups of partners to the
 * shared address book (the structure, or the account without a structure).
 * Like every agenda function, the ids come from requireAgendaOwner, never
 * from the page. A contact without a group belongs to the first group of its
 * kind (the order is the user's).
 */

/** The shared address book of partners: the structure's, or the account's own without a structure. */
export type AddressBook = { readonly orgId: string } | { readonly userId: string };

export type GroupScope =
  | { readonly kind: "PERSONS"; readonly ownerId: string }
  | { readonly kind: "PARTNERS"; readonly book: AddressBook };

export type AgendaGroupView = GroupTag & { readonly kind: GroupKindValue; readonly count: number };

const DUPLICATE_MESSAGE = "Un groupe porte déjà ce nom.";
const NOT_FOUND_MESSAGE = "Groupe introuvable.";
const LAST_GROUP_MESSAGE: Readonly<Record<GroupKindValue, string>> = {
  PERSONS: "Il faut garder au moins un groupe de personnes.",
  PARTNERS: "Il faut garder au moins un groupe de contacts.",
};
const ORDER = [{ position: "asc" }, { createdAt: "asc" }] satisfies Prisma.AgendaGroupOrderByWithRelationInput[];

/** The groups of the scope. */
function scopeWhere(scope: GroupScope): Prisma.AgendaGroupWhereInput {
  if (scope.kind === "PERSONS") return { kind: "PERSONS", ownerId: scope.ownerId };
  return "orgId" in scope.book ? { kind: "PARTNERS", orgId: scope.book.orgId } : { kind: "PARTNERS", ownerId: scope.book.userId, orgId: null };
}

/** Columns of a new group of the scope. */
function scopeData(scope: GroupScope): { ownerId?: string; orgId?: string } {
  if (scope.kind === "PERSONS") return { ownerId: scope.ownerId };
  return "orgId" in scope.book ? { orgId: scope.book.orgId } : { ownerId: scope.book.userId };
}

/** Where two groups may not share a name (the database's unique keys: owner + name, structure + name). */
function nameArea(scope: GroupScope): Prisma.AgendaGroupWhereInput {
  const data = scopeData(scope);
  return data.orgId !== undefined ? { orgId: data.orgId } : { ownerId: data.ownerId, orgId: null };
}

export function partnerWhere(book: AddressBook): Prisma.AgendaPartnerWhereInput {
  return "orgId" in book ? { orgId: book.orgId } : { userId: book.userId, orgId: null };
}

/** The group of each member (person or partner) of the scope. */
function memberGroups(scope: GroupScope): Promise<{ groupId: string | null }[]> {
  if (scope.kind === "PERSONS") {
    return db.agendaContact.findMany({ where: { ownerId: scope.ownerId, category: "PROTEGE" }, select: { groupId: true } });
  }
  return db.agendaPartner.findMany({ where: partnerWhere(scope.book), select: { groupId: true } });
}

/** The default groups, created on first read (idempotent: unique names). */
async function ensureDefaultGroups(scope: GroupScope): Promise<void> {
  if ((await db.agendaGroup.count({ where: scopeWhere(scope) })) > 0) return;
  const defaults = scope.kind === "PERSONS" ? [DEFAULT_PERSON_GROUP] : DEFAULT_PARTNER_GROUPS;
  const data = defaults.map((g, position) => ({ ...scopeData(scope), kind: scope.kind, name: g.name, color: g.color, position }));
  await db.agendaGroup.createMany({ data, skipDuplicates: true });
}

function groupRows(scope: GroupScope) {
  return db.agendaGroup.findMany({ where: scopeWhere(scope), orderBy: ORDER, select: { id: true, name: true, color: true, kind: true } });
}

const toTag = (row: { id: string; name: string; color: string }): GroupTag => ({ id: row.id, name: row.name, color: toGroupColor(row.color) });

/** The groups of the scope, in the user's order, each with how many contacts it holds. */
export async function listGroups(scope: GroupScope): Promise<AgendaGroupView[]> {
  await ensureDefaultGroups(scope);
  const [rows, members] = await Promise.all([groupRows(scope), memberGroups(scope)]);
  const tags = rows.map(toTag);
  return rows.map((row) => {
    const count = members.filter((m) => groupOf(m.groupId, tags)?.id === row.id).length;
    return { ...toTag(row), kind: row.kind, count };
  });
}

/** The groups of persons to visit (the « Personnes à visiter » tab). */
export function listAgendaGroups(ownerId: string): Promise<AgendaGroupView[]> {
  return listGroups({ kind: "PERSONS", ownerId });
}

/** Contact id -> its group, for the week and month (persons to visit only, for now). */
export async function contactGroupTags(ownerId: string): Promise<ReadonlyMap<string, GroupTag>> {
  const [rows, persons] = await Promise.all([
    groupRows({ kind: "PERSONS", ownerId }),
    db.agendaContact.findMany({ where: { ownerId, category: "PROTEGE" }, select: { id: true, groupId: true } }),
  ]);
  const tags = rows.map(toTag);
  return new Map(
    persons.flatMap((p) => {
      const tag = groupOf(p.groupId, tags);
      return tag ? [[p.id, tag] as const] : [];
    }),
  );
}

async function assertFreeName(tx: Tx, scope: GroupScope, name: string, exceptId: string | null): Promise<void> {
  const rows = await tx.agendaGroup.findMany({ where: nameArea(scope), select: { id: true, name: true } });
  if (rows.some((r) => r.id !== exceptId && sameGroupName(r.name, name))) throw new AgendaRefusal(DUPLICATE_MESSAGE);
}

export async function createGroup(scope: GroupScope, input: AgendaGroupInput): Promise<void> {
  // The defaults come first, even if the list was never read: a new group never replaces them.
  await ensureDefaultGroups(scope);
  await db.$transaction(async (tx) => {
    if ((await tx.agendaGroup.count({ where: nameArea(scope) })) >= MAX_GROUPS_PER_OWNER) {
      throw new AgendaRefusal(`L'agenda est limité à ${MAX_GROUPS_PER_OWNER} groupes.`);
    }
    await assertFreeName(tx, scope, input.name, null);
    const last = await tx.agendaGroup.aggregate({ where: scopeWhere(scope), _max: { position: true } });
    await tx.agendaGroup.create({
      data: { ...scopeData(scope), kind: scope.kind, name: input.name, color: input.color, position: (last._max.position ?? 0) + 1 },
    });
  });
}

/** The group, if it belongs to the scope. */
function findInScope(tx: Tx, scope: GroupScope, groupId: string) {
  return tx.agendaGroup.findFirst({ where: { ...scopeWhere(scope), id: groupId }, select: { id: true } });
}

/** False when the group is not in the scope. */
export async function updateGroup(scope: GroupScope, groupId: string, input: AgendaGroupInput): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (!(await findInScope(tx, scope, groupId))) return false;
    await assertFreeName(tx, scope, input.name, groupId);
    await tx.agendaGroup.update({ where: { id: groupId }, data: { name: input.name, color: input.color } });
    return true;
  });
}

/** Swaps the group with its neighbour; the first group is where contacts without a group go. */
export async function moveGroup(scope: GroupScope, groupId: string, direction: "up" | "down"): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const rows = await tx.agendaGroup.findMany({ where: scopeWhere(scope), orderBy: ORDER, select: { id: true } });
    const at = rows.findIndex((r) => r.id === groupId);
    if (at < 0) return false;
    const to = direction === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= rows.length) return true;
    const order = rows.map((r) => r.id);
    [order[at], order[to]] = [order[to] ?? groupId, order[at] ?? groupId];
    // Rewrites every position: older rows may share one.
    for (const [position, id] of order.entries()) {
      await tx.agendaGroup.update({ where: { id }, data: { position } });
    }
    return true;
  });
}

export type GroupDeletion = { readonly moved: number; readonly into: string };

/** Moves the members of a group (and, for the first group, those without one) to another group. */
async function moveMembers(tx: Tx, scope: GroupScope, from: string, isFirst: boolean, to: string): Promise<number> {
  const groupFilter = { OR: [{ groupId: from }, ...(isFirst ? [{ groupId: null }] : [])] };
  if (scope.kind === "PERSONS") {
    const where = { ownerId: scope.ownerId, category: "PROTEGE" as const, ...groupFilter };
    return (await tx.agendaContact.updateMany({ where, data: { groupId: to } })).count;
  }
  return (await tx.agendaPartner.updateMany({ where: { ...partnerWhere(scope.book), ...groupFilter }, data: { groupId: to } })).count;
}

/**
 * Deletes a group; its contacts go to the first remaining group (named in the
 * answer). The last group of a kind cannot be deleted. Null when the group is
 * not in the scope.
 */
export async function deleteGroup(scope: GroupScope, groupId: string): Promise<GroupDeletion | null> {
  return db.$transaction(async (tx) => {
    const rows = await tx.agendaGroup.findMany({ where: scopeWhere(scope), orderBy: ORDER, select: { id: true, name: true } });
    if (!rows.some((r) => r.id === groupId)) return null;
    const target = rows.find((r) => r.id !== groupId);
    if (!target) throw new AgendaRefusal(LAST_GROUP_MESSAGE[scope.kind]);
    const moved = await moveMembers(tx, scope, groupId, rows[0]?.id === groupId, target.id);
    await tx.agendaGroup.delete({ where: { id: groupId } });
    return { moved, into: target.name };
  });
}

/** The group chosen for a contact must be one of the scope's groups. */
export async function assertGroupInScope(tx: Tx, scope: GroupScope, groupId: string | null): Promise<void> {
  if (groupId !== null && !(await findInScope(tx, scope, groupId))) throw new AgendaRefusal(NOT_FOUND_MESSAGE);
}

/** The group chosen for a person must be one of this owner's groups of persons. */
export function assertPersonGroup(tx: Tx, ownerId: string, groupId: string | null): Promise<void> {
  return assertGroupInScope(tx, { kind: "PERSONS", ownerId }, groupId);
}

/** Selection mode: puts the selected persons in one group. */
export async function setPersonsGroup(ownerId: string, personIds: string[], groupId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    await assertPersonGroup(tx, ownerId, groupId);
    const { count } = await tx.agendaContact.updateMany({
      where: { ownerId, id: { in: personIds }, category: "PROTEGE" },
      data: { groupId },
    });
    return count;
  });
}

// Kept for the persons' screens and tests.
export const createAgendaGroup = (ownerId: string, input: AgendaGroupInput) => createGroup({ kind: "PERSONS", ownerId }, input);
export const updateAgendaGroup = (ownerId: string, groupId: string, input: AgendaGroupInput) =>
  updateGroup({ kind: "PERSONS", ownerId }, groupId, input);
export const moveAgendaGroup = (ownerId: string, groupId: string, direction: "up" | "down") =>
  moveGroup({ kind: "PERSONS", ownerId }, groupId, direction);
export const deleteAgendaGroup = (ownerId: string, groupId: string) => deleteGroup({ kind: "PERSONS", ownerId }, groupId);
