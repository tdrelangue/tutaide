"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { compareByName, type NameSortBasis } from "@/lib/name-sort";
import { loadNameSortBasis } from "@/lib/local-prefs";
import { cn } from "@/lib/utils";
import { cityKey } from "@/lib/agenda-engine/domain/grouping";

/**
 * Tables sorted by clicking their headers (Thomas, 2026-11-03): by name — the
 * last or the first name, as chosen in Paramètres, like the dossiers — or by
 * address, town first so a town's people are side by side.
 */
export type SortKey = "name" | "address" | "seen" | "planned" | "next";
export type TableSort = { readonly key: SortKey; readonly direction: 1 | -1; readonly basis: NameSortBasis };
export type DateKey = Exclude<SortKey, "name" | "address">;

/**
 * "soudeilles|les landes, 19300 soudeilles": the town (as the planner reads it,
 * also when the address is the bare commune), then the whole label.
 */
function townFirst(label: string): string {
  const plain = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const town = cityKey(label)?.replace(/^\d{5} /, "") ?? "";
  return `${town}|${plain}`;
}

type Sortable = { readonly fullName: string; readonly address: { readonly label: string } | null };

/** The date of a row for « Vu le », « Prévu le », « Prochaine visite »; null = none. */
export type DateOf<T> = (row: T, key: DateKey) => string | null;

/**
 * Pure: a new array, never the one given. Rows without an address come last.
 * « Vu le » A→Z = not seen for the longest first, never seen at the very top;
 * « Prévu le » and « Prochaine visite » = soonest first, nothing planned last.
 */
export function sortRows<T extends Sortable>(rows: readonly T[], sort: TableSort, nameOf: (row: T) => string = (r) => r.fullName, dateOf?: DateOf<T>): T[] {
  const byName = (a: T, b: T) => compareByName(nameOf(a), nameOf(b), sort.basis);
  const { key } = sort;
  return [...rows].sort((a, b) => {
    if (key === "name") return sort.direction * byName(a, b);
    if (key === "address") {
      if (a.address === null || b.address === null) return a.address === null ? (b.address === null ? byName(a, b) : 1) : -1;
      return sort.direction * townFirst(a.address.label).localeCompare(townFirst(b.address.label), "fr-FR") || byName(a, b);
    }
    const da = dateOf?.(a, key) ?? null;
    const db = dateOf?.(b, key) ?? null;
    if (da === null || db === null) {
      if (da === db) return byName(a, b);
      // Never seen is the most urgent; nothing planned is the least.
      const missingFirst = key === "seen" ? -1 : 1;
      return (da === null ? missingFirst : -missingFirst) * sort.direction;
    }
    return sort.direction * da.localeCompare(db) || byName(a, b);
  });
}

export function useTableSort() {
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: 1, basis: "LAST_NAME" });
  // The preference lives in this browser: read after the first render, so the server's HTML matches.
  useEffect(() => {
    const basis = loadNameSortBasis();
    setSort((current) => (current.basis === basis ? current : { ...current, basis }));
  }, []);
  /** Same column: the other way round; another column: A to Z. */
  function toggle(key: SortKey) {
    setSort((current) => (current.key === key ? { ...current, direction: current.direction === 1 ? -1 : 1 } : { ...current, key, direction: 1 }));
  }
  return { sort, toggle };
}

type HeaderProps = {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly sort: TableSort;
  readonly onSort: (key: SortKey) => void;
  readonly className?: string;
};

/** A column header that sorts: a button inside the <th>, its state in aria-sort (read by screen readers). */
export function SortableHeader({ label, sortKey, sort, onSort, className }: HeaderProps) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? ArrowUpDown : sort.direction === 1 ? ArrowUp : ArrowDown;
  const ariaSort = !isActive ? "none" : sort.direction === 1 ? "ascending" : "descending";
  function handleClick() {
    onSort(sortKey);
  }
  return (
    <th scope="col" aria-sort={ariaSort} className={cn("px-3 py-2 font-medium", className)}>
      <button
        type="button"
        onClick={handleClick}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", isActive ? "text-foreground" : "text-muted-foreground")} aria-hidden="true" />
        <span className="sr-only">{isActive ? "" : " : trier"}</span>
      </button>
    </th>
  );
}
