/**
 * Reads an address book file in the browser (the file itself is never sent):
 * a vCard as text, a CSV with its own separator and encoding, anything else
 * with the spreadsheet reader.
 */

export type ReadFile =
  | { kind: "vcard"; text: string }
  | { kind: "rows"; rows: unknown[][] };

/** Excel's French CSV is often Windows-1252, not UTF-8. */
function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** « ; » (French Excel), « , » or tab: the one the first line uses most. */
export function csvSeparator(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((sep) => ({ sep, n: first.split(sep).length - 1 }));
  return counts.sort((a, b) => b.n - a.n)[0]?.sep ?? ";";
}

export async function readAddressBookFile(file: File): Promise<ReadFile> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".vcf") || name.endsWith(".vcard")) return { kind: "vcard", text: decode(buffer) };
  const XLSX = await import("xlsx");
  const workbook = name.endsWith(".csv") || name.endsWith(".txt")
    ? XLSX.read(decode(buffer).replace(/^﻿/, ""), { type: "string", FS: csvSeparator(decode(buffer)) })
    : XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) return { kind: "rows", rows: [] };
  return { kind: "rows", rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" }) };
}
