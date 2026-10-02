export type NameSortBasis = "LAST_NAME" | "FIRST_NAME";

/**
 * Splits "Prénom Nom" on whitespace only, so a hyphenated compound name
 * ("Jean-Paul", "Dupont-Martin") stays a single token on either side.
 */
function tokenize(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean);
}

export function getNameSortKey(fullName: string, basis: NameSortBasis): string {
  const tokens = tokenize(fullName);
  if (tokens.length === 0) return "";
  const token = basis === "FIRST_NAME" ? tokens[0] : tokens[tokens.length - 1];
  return token.toLocaleLowerCase("fr-FR");
}

export function compareByName(
  fullNameA: string,
  fullNameB: string,
  basis: NameSortBasis
): number {
  return getNameSortKey(fullNameA, basis).localeCompare(
    getNameSortKey(fullNameB, basis),
    "fr-FR",
    { sensitivity: "base" }
  );
}
