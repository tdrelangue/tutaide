"use client";

/**
 * Working with OrigPDF (OrigAI's PDF workstation) on the same computer,
 * through the Tutellia desktop app (see src-tauri/src/origpdf.rs).
 * Everything returns a "nothing to do" value in a plain browser.
 */

export type OrigPdfModule = "APA" | "ASH" | "PCH";

export interface OrigPdfInboxItem {
  id: string;
  module: OrigPdfModule;
  /** The file name the person had in OrigPDF. */
  name: string;
  sentAt: string;
  size: number;
}

const MODULES: readonly OrigPdfModule[] = ["APA", "ASH", "PCH"];

/** The Tauri API, only inside the desktop app. */
async function desktop() {
  const core = await import("@tauri-apps/api/core");
  return core.isTauri() ? core : null;
}

export function isOrigPdfModule(value: string): value is OrigPdfModule {
  return (MODULES as readonly string[]).includes(value);
}

let installedCheck: Promise<boolean> | null = null;

/** Is OrigPDF installed on this computer? Checked once per page load. */
export function isOrigPdfInstalled(): Promise<boolean> {
  installedCheck ??= desktop()
    .then((core) => (core ? core.invoke<{ installed: boolean }>("origpdf_status") : { installed: false }))
    .then((status) => status.installed)
    .catch(() => false);
  return installedCheck;
}

/**
 * Downloads the PDF with the person's session and opens it in OrigPDF
 * (started if closed). Throws a French message when it cannot.
 */
export async function openInOrigPdf(url: string, filename: string): Promise<void> {
  const core = await desktop();
  if (!core) throw new Error("Disponible dans l'application Tutellia uniquement");
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Document introuvable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    await core.invoke("open_in_origpdf", bytes, { headers: { "x-filename": encodeURIComponent(filename) } });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "Impossible d'ouvrir OrigPDF");
  }
}

/** Documents sent from OrigPDF and not filed yet, oldest first. */
export async function listOrigPdfInbox(): Promise<OrigPdfInboxItem[]> {
  const core = await desktop();
  if (!core) return [];
  try {
    return await core.invoke<OrigPdfInboxItem[]>("origpdf_inbox_list");
  } catch {
    return [];
  }
}

/** One inbox document as a File the sorting screens accept. */
export async function readOrigPdfInboxFile(item: OrigPdfInboxItem): Promise<File> {
  const core = await desktop();
  if (!core) throw new Error("Disponible dans l'application Tutellia uniquement");
  const bytes = await core.invoke<ArrayBuffer>("origpdf_inbox_read", { id: item.id });
  const name = item.name.toLowerCase().endsWith(".pdf") ? item.name : `${item.name}.pdf`;
  return new File([bytes], name, { type: "application/pdf" });
}

/** Takes a document out of the inbox (filed, or discarded by the person). */
export async function removeOrigPdfInboxItem(id: string): Promise<void> {
  const core = await desktop();
  if (core) await core.invoke("origpdf_inbox_remove", { id });
}

/** Tells OrigPDF which modules to offer (the ones this person works with). */
export async function reportModulesToOrigPdf(modules: string[]): Promise<void> {
  const core = await desktop();
  if (!core) return;
  const known = modules.map((m) => m.toUpperCase()).filter(isOrigPdfModule);
  await core.invoke("origpdf_report_modules", { modules: known }).catch(() => undefined);
}
