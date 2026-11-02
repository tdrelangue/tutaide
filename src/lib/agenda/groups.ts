import { db } from "@/lib/db";
import { AgendaRefusal } from "./bridge/errors";
import type { Tx } from "./bridge/lock";
import {
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
 * the user. Like every agenda function, the owner id comes from
 * requireAgendaOwner, never from the page. A contact without a group belongs
 * to the first group of its kind (the order is the user's).
 */

export type AgendaGroupView = GroupTag & { readonly kind: GroupKindValue; readonly count: number };

const DUPLICATE_MESSAGE = "Un groupe porte déjà ce nom.";
const LAST_GROUP_MESSAGE = "Il faut garder au moins un groupe de personnes.";
const NOT_FOUND_MESSAGE = "Groupe introuvable.";

/** Every agenda has at least the « Mesures » group; created on first read (idempotent). */
async function ensureDefaultGroup(ownerId: string): Promise<void> {
  const count = await db.agendaGroup.count({ where: { ownerId, kind: "PERSONS" } });
  if (count > 0) return;
  // skipDuplicates: two first reads at the same time create it once (unique owner + name).
  await db.agendaGroup.createMany({ data: [{ ownerId, kind: "PERSONS", ...DEFAULT_PERSON_GROUP }], skipDuplicates: true });
}

function groupRows(ownerId: string, kind: GroupKindValue) {
  return db.agendaGroup.findMany({
    where: { ownerId, kind },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, kind: true },
  });
}

const toTag = (row: { id: string; name: string; color: string }): GroupTag => ({ id: row.id, name: row.name, color: toGroupColor(row.color) });

/** The groups of persons to visit, in the user's order, each with how many persons it holds. */
export async function listAgendaGroups(ownerId: string): Promise<AgendaGroupView[]> {
  await ensureDefaultGroup(ownerId);
  const [rows, persons] = await Promise.all([
    groupRows(ownerId, "PERSONS"),
    db.agendaContact.findMany({ where: { ownerId, category: "PROTEGE" }, select: { groupId: true } }),
  ]);
  const tags = rows.map(toTag);
  return rows.map((row) => {
    const count = persons.filter((p) => groupOf(p.groupId, tags)?.id === row.id).length;
    return { ...toTag(row), kind: row.kind, count };
  });
}

/** Contact id -> its group, for the week and month (persons to visit only, for now). */
export async function contactGroupTags(ownerId: string): Promise<ReadonlyMap<string, GroupTag>> {
  const [rows, persons] = await Promise.all([
    groupRows(ownerId, "PERSONS"),
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

async function assertFreeName(tx: Tx, ownerId: string, name: string, exceptId: string | null): Promise<void> {
  const rows = await tx.agendaGroup.findMany({ where: { ownerId }, select: { id: true, name: true } });
  if (rows.some((r) => r.id !== exceptId && sameGroupName(r.name, name))) throw new AgendaRefusal(DUPLICATE_MESSAGE);
}

export async function createAgendaGroup(ownerId: string, input: AgendaGroupInput): Promise<void> {
  await db.$transaction(async (tx) => {
    if ((await tx.agendaGroup.count({ where: { ownerId } })) >= MAX_GROUPS_PER_OWNER) {
      throw new AgendaRefusal(`L'agenda est limité à ${MAX_GROUPS_PER_OWNER} groupes.`);
    }
    await assertFreeName(tx, ownerId, input.name, null);
    const last = await tx.agendaGroup.aggregate({ where: { ownerId, kind: "PERSONS" }, _max: { position: true } });
    await tx.agendaGroup.create({
      data: { ownerId, kind: "PERSONS", name: input.name, color: input.color, position: (last._max.position ?? 0) + 1 },
    });
  });
}

/** False when the group is not this owner's. */
export async function updateAgendaGroup(ownerId: string, groupId: string, input: AgendaGroupInput): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const row = await tx.agendaGroup.findFirst({ where: { id: groupId, ownerId }, select: { id: true } });
    if (!row) return false;
    await assertFreeName(tx, ownerId, input.name, groupId);
    await tx.agendaGroup.update({ where: { id_ownerId: { id: groupId, ownerId } }, data: { name: input.name, color: input.color } });
    return true;
  });
}

/** Swaps the group with its neighbour; the first group is where persons without a group go. */
export async function moveAgendaGroup(ownerId: string, groupId: string, direction: "up" | "down"): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const rows = await tx.agendaGroup.findMany({
      where: { ownerId, kind: "PERSONS" },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const at = rows.findIndex((r) => r.id === groupId);
    if (at < 0) return false;
    const to = direction === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= rows.length) return true;
    const order = rows.map((r) => r.id);
    [order[at], order[to]] = [order[to] ?? groupId, order[at] ?? groupId];
    // Rewrites every position: older rows may share one.
    for (const [position, id] of order.entries()) {
      await tx.agendaGroup.update({ where: { id_ownerId: { id, ownerId } }, data: { position } });
    }
    return true;
  });
}

export type GroupDeletion = { readonly moved: number; readonly into: string };

/**
 * Deletes a group; its persons go to the first remaining group (named in the
 * answer). The last group of persons cannot be deleted. Null when the group is
 * not this owner's.
 */
export async function deleteAgendaGroup(ownerId: string, groupId: string): Promise<GroupDeletion | null> {
  return db.$transaction(async (tx) => {
    const rows = await tx.agendaGroup.findMany({
      where: { ownerId, kind: "PERSONS" },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    });
    if (!rows.some((r) => r.id === groupId)) return null;
    const target = rows.find((r) => r.id !== groupId);
    if (!target) throw new AgendaRefusal(LAST_GROUP_MESSAGE);
    // Persons without a group follow the first one: if it goes, they are moved too.
    const isFirst = rows[0]?.id === groupId;
    const members = { ownerId, category: "PROTEGE" as const, OR: [{ groupId }, ...(isFirst ? [{ groupId: null }] : [])] };
    const { count } = await tx.agendaContact.updateMany({ where: members, data: { groupId: target.id } });
    await tx.agendaGroup.delete({ where: { id_ownerId: { id: groupId, ownerId } } });
    return { moved: count, into: target.name };
  });
}

/** The group chosen for a person must be one of this owner's groups of persons. */
export async function assertPersonGroup(tx: Tx, ownerId: string, groupId: string | null): Promise<void> {
  if (groupId === null) return;
  const row = await tx.agendaGroup.findFirst({ where: { id: groupId, ownerId, kind: "PERSONS" }, select: { id: true } });
  if (!row) throw new AgendaRefusal(NOT_FOUND_MESSAGE);
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
