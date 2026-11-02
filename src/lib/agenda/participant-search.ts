/**
 * « Avec qui ? » search (Thomas, 2026-11-02): a few letters of the name, in
 * any order, without minding accents or capitals, optionally within one
 * group. Pure, no I/O.
 */

export type SearchablePerson = { readonly id: string; readonly fullName: string; readonly group?: { readonly id: string } | null };

export type SearchResult<T> = { readonly matches: readonly T[]; readonly total: number };

/** Suggestions shown at once; more means « précisez la recherche ». */
export const MAX_SUGGESTIONS = 8;

/** "Élodie D'Hôtel-Bonneau" -> ["elodie", "d", "hotel", "bonneau"]. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "");
}

/** Every typed word starts one of the name's words: « bon je » finds « Jean Bonneau ». */
function matchesAll(name: readonly string[], typed: readonly string[]): boolean {
  return typed.every((t) => name.some((w) => w.startsWith(t)));
}

/** The name's first word starts with the first typed word: best suggestions first. */
function rank(name: readonly string[], typed: readonly string[]): number {
  const first = typed[0];
  if (first === undefined) return 1;
  return name[0]?.startsWith(first) ? 0 : 1;
}

export function searchPersons<T extends SearchablePerson>(
  persons: readonly T[],
  query: string,
  options: { readonly groupId?: string | null; readonly exclude?: ReadonlySet<string>; readonly limit?: number } = {},
): SearchResult<T> {
  const typed = words(query);
  const { groupId = null, exclude, limit = MAX_SUGGESTIONS } = options;
  const found = persons
    .filter((p) => !exclude?.has(p.id) && (groupId === null || p.group?.id === groupId))
    .map((p) => ({ person: p, name: words(p.fullName) }))
    .filter(({ name }) => matchesAll(name, typed))
    .sort((a, b) => rank(a.name, typed) - rank(b.name, typed) || a.person.fullName.localeCompare(b.person.fullName, "fr"));
  return { matches: found.slice(0, limit).map((f) => f.person), total: found.length };
}
