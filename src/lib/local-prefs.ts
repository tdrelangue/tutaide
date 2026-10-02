import type { NameSortBasis } from "./name-sort";

const DOSSIERS_FILTER_PREFIX = "tutaide:dossiers-filters:";
const NAME_SORT_BASIS_KEY = "tutaide:name-sort-basis";

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode, etc.) — preference just won't persist
  }
}

export type DossiersFilterPrefs = {
  status?: "ACTIVE" | "CLOSED";
  sort: string;
};

export function loadDossiersFilterPrefs(
  moduleType: string
): DossiersFilterPrefs | null {
  return loadJson<DossiersFilterPrefs>(`${DOSSIERS_FILTER_PREFIX}${moduleType}`);
}

export function saveDossiersFilterPrefs(
  moduleType: string,
  prefs: DossiersFilterPrefs
): void {
  saveJson(`${DOSSIERS_FILTER_PREFIX}${moduleType}`, prefs);
}

export type LegacyDossiersFilterPrefs = {
  priority?: "NORMAL" | "PRIORITAIRE" | "URGENT";
  sort: string;
};

export function loadLegacyDossiersFilterPrefs(): LegacyDossiersFilterPrefs | null {
  return loadJson<LegacyDossiersFilterPrefs>(`${DOSSIERS_FILTER_PREFIX}legacy`);
}

export function saveLegacyDossiersFilterPrefs(
  prefs: LegacyDossiersFilterPrefs
): void {
  saveJson(`${DOSSIERS_FILTER_PREFIX}legacy`, prefs);
}

export function loadNameSortBasis(): NameSortBasis {
  try {
    return localStorage.getItem(NAME_SORT_BASIS_KEY) === "FIRST_NAME"
      ? "FIRST_NAME"
      : "LAST_NAME";
  } catch {
    return "LAST_NAME";
  }
}

export function saveNameSortBasis(basis: NameSortBasis): void {
  try {
    localStorage.setItem(NAME_SORT_BASIS_KEY, basis);
  } catch {
    // localStorage unavailable — preference just won't persist
  }
}
