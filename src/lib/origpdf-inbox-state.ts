/**
 * Which OrigPDF inbox entries a sorting flow has filed. `inFlight` maps each
 * inbox file handed to sorting to its entry id; files that are not from the
 * inbox (dropped by hand) are ignored. Pure: returns what to remove and the
 * map without the filed files.
 */
export function filedInboxEntries(
  inFlight: ReadonlyMap<File, string>,
  handled: readonly File[],
  remaining: readonly File[]
): { ids: string[]; inFlight: Map<File, string> } {
  const filed = handled.filter((file) => inFlight.has(file) && !remaining.includes(file));
  const ids = [...new Set(filed.map((file) => inFlight.get(file) ?? ""))].filter(Boolean);
  const next = new Map([...inFlight].filter(([file]) => !filed.includes(file)));
  return { ids, inFlight: next };
}
