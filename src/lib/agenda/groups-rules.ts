/**
 * « Agenda » groups — pure rules, no I/O (Thomas, 2026-11-02). One group per
 * contact; the user creates, renames and recolours them. The colour comes
 * from a fixed palette (readable in light and dark) and is never shown alone:
 * the group's name is always written next to it.
 */

export const GROUP_COLORS = ["blue", "teal", "green", "lime", "amber", "orange", "red", "pink", "purple", "slate"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export const GROUP_COLOR_LABELS: Readonly<Record<GroupColor, string>> = {
  blue: "Bleu",
  teal: "Bleu-vert",
  green: "Vert",
  lime: "Vert clair",
  amber: "Jaune",
  orange: "Orange",
  red: "Rouge",
  pink: "Rose",
  purple: "Violet",
  slate: "Gris",
};

export type GroupKindValue = "PERSONS" | "PARTNERS";

/** Given to every agenda; no « Ad hoc » group: users make their own (Thomas, 2026-11-02). */
export const DEFAULT_PERSON_GROUP = { name: "Mesures", color: "blue" } as const satisfies { name: string; color: GroupColor };

export const MAX_GROUPS_PER_OWNER = 30;

export function isGroupColor(value: string): value is GroupColor {
  return GROUP_COLORS.some((c) => c === value);
}

/** Unknown stored values fall back to grey rather than breaking the screen. */
export function toGroupColor(value: string): GroupColor {
  return isGroupColor(value) ? value : "slate";
}

/** « Ad hoc », « ad  hoc », « AD HOC » are the same name. */
export function sameGroupName(a: string, b: string): boolean {
  const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return key(a) === key(b);
}

/** The first colour no group uses yet, so a new group stands out. */
export function nextFreeColor(used: readonly string[]): GroupColor {
  return GROUP_COLORS.find((c) => !used.includes(c)) ?? GROUP_COLORS[used.length % GROUP_COLORS.length] ?? "slate";
}

export type GroupTag = { readonly id: string; readonly name: string; readonly color: GroupColor };

/** A contact's group: its own, or the first group of the kind when none was chosen. */
export function groupOf(groupId: string | null, groups: readonly GroupTag[]): GroupTag | null {
  return groups.find((g) => g.id === groupId) ?? groups[0] ?? null;
}
