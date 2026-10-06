/**
 * The pile of files waiting to be filed by hand. Pure functions: every change
 * returns a new array. A filed item keeps where it went, so it can be undone.
 */

export type Placement = { dossierId: string; dossierName: string; documentId: string };

export type SortState = "pending" | "skipped" | "placed";

export type SortItem<F = File> = {
  key: string;
  file: F;
  state: SortState;
  placement?: Placement;
};

export function createQueue<F>(files: F[]): SortItem<F>[] {
  return files.map((file, i) => ({ key: `${i}`, file, state: "pending" }));
}

/** The file shown on screen: the first one still waiting. */
export function currentItem<F>(items: SortItem<F>[]): SortItem<F> | undefined {
  return items.find((item) => item.state === "pending");
}

export function markPlaced<F>(items: SortItem<F>[], key: string, placement: Placement): SortItem<F>[] {
  return items.map((item) => (item.key === key ? { ...item, state: "placed", placement } : item));
}

export function markSkipped<F>(items: SortItem<F>[], key: string): SortItem<F>[] {
  return items.map((item) => (item.key === key ? { ...item, state: "skipped" } : item));
}

/** Skipped files come back to the pile, in their original order. */
export function reviewSkipped<F>(items: SortItem<F>[]): SortItem<F>[] {
  return items.map((item) => (item.state === "skipped" ? { ...item, state: "pending" } : item));
}

/** Takes a filed item back out and puts it first, so it is the next one shown. */
export function undoPlacement<F>(items: SortItem<F>[], key: string): SortItem<F>[] {
  const target = items.find((item) => item.key === key);
  if (!target || target.state !== "placed") return items;
  const restored: SortItem<F> = { key: target.key, file: target.file, state: "pending" };
  return [restored, ...items.filter((item) => item.key !== key)];
}

export function countByState<F>(items: SortItem<F>[]): Record<SortState, number> {
  const counts: Record<SortState, number> = { pending: 0, skipped: 0, placed: 0 };
  for (const item of items) counts[item.state] += 1;
  return counts;
}
