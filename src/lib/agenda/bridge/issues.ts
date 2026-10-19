/**
 * A row the bridge could not (fully) use. Mappers never drop a row silently:
 * they hand back the reason, and the caller decides what to show.
 */
export type BridgeIssueKind =
  | "settings"
  | "contact"
  | "rule"
  | "appointment"
  | "item"
  | "pin"
  | "override"
  | "place";

export type BridgeIssue = {
  readonly kind: BridgeIssueKind;
  readonly id: string;
  /** Machine code, e.g. "NO_HOME", "BAD_WHEN". */
  readonly reason: string;
};

/** One mapped row: `value` is null when the row is unusable (or the field is simply absent). */
export type Mapped<T> = { readonly value: T | null; readonly issues: readonly BridgeIssue[] };
/** Many mapped rows: only the usable ones. */
export type Many<T> = { readonly values: readonly T[]; readonly issues: readonly BridgeIssue[] };

/** A legitimately absent value: no value, no issue. */
export const ABSENT: Mapped<never> = { value: null, issues: [] };

export function makeIssue(kind: BridgeIssueKind, id: string, reason: string): BridgeIssue {
  return { kind, id, reason };
}

export function found<T>(value: T, issues: readonly BridgeIssue[] = []): Mapped<T> {
  return { value, issues };
}

export function rejected(issues: readonly BridgeIssue[]): Mapped<never> {
  return { value: null, issues };
}

export function mapMany<R, T>(rows: readonly R[], map: (row: R) => Mapped<T>): Many<T> {
  const results = rows.map(map);
  return {
    values: results.flatMap((r) => (r.value === null ? [] : [r.value])),
    issues: results.flatMap((r) => r.issues),
  };
}

/** Rows grouped by a key; rows whose key is null are left out. */
export function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const group = groups.get(k) ?? [];
    group.push(row);
    groups.set(k, group);
  }
  return groups;
}
