"use client";

import { useId } from "react";
import type { AgendaGroupView } from "@/lib/agenda/groups";
import { PARTNER_FIELDS, PARTNER_FIELD_LABELS, type PartnerField, type PartnerFileLine } from "@/lib/agenda/partners-file";
import { partnerName } from "@/lib/agenda/rules";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type DuplicateMode = "keep" | "replace" | "skip";

export const DUPLICATE_LABELS: Readonly<Record<DuplicateMode, string>> = {
  keep: "Compléter le contact existant",
  replace: "Remplacer par le fichier",
  skip: "Ne pas importer",
};

type MappingProps = {
  header: readonly unknown[];
  mapping: readonly (PartnerField | null)[];
  onChange: (mapping: (PartnerField | null)[]) => void;
};

/** Each column of the file and the field it was read as: the user corrects a column misread. */
export function ColumnMapping({ header, mapping, onChange }: MappingProps) {
  const baseId = useId();
  function setField(index: number, value: string) {
    const field = PARTNER_FIELDS.find((f) => f === value) ?? null;
    // A field goes to one column only: the column that had it is cleared.
    onChange(mapping.map((f, i) => (i === index ? field : f === field && field !== null ? null : f)));
  }
  return (
    <details className="rounded-md border p-3 text-sm" open={!mapping.some((f) => f !== null)}>
      <summary className="cursor-pointer font-medium">Colonnes reconnues ({mapping.filter((f) => f !== null).length} sur {header.length}) : vérifier ou corriger</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {header.map((cell, i) => (
          <li key={i} className="flex items-center gap-2">
            <label htmlFor={`${baseId}-${i}`} className="min-w-0 flex-1 truncate" title={String(cell ?? "")}>
              « {String(cell ?? "") || `Colonne ${i + 1}`} »
            </label>
            <select id={`${baseId}-${i}`} value={mapping[i] ?? ""} onChange={(e) => setField(i, e.target.value)} className={`${SELECT_CLASS} w-44`}>
              <option value="">Ignorer</option>
              {PARTNER_FIELDS.map((f) => <option key={f} value={f}>{PARTNER_FIELD_LABELS[f]}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </details>
  );
}

export type ReviewLine = {
  line: PartnerFileLine;
  groupId: string | null;
  /** Name of the contact already in the book, when this line is a duplicate. */
  duplicateOf: string | null;
  mode: DuplicateMode;
};

type TableProps = {
  lines: readonly ReviewLine[];
  groups: readonly AgendaGroupView[];
  onGroup: (index: number, groupId: string) => void;
  onMode: (index: number, mode: DuplicateMode) => void;
};

const MODES: DuplicateMode[] = ["keep", "replace", "skip"];

/** Every line, its group (changeable), and what to do with a contact already in the book. */
export function LinesTable({ lines, groups, onGroup, onMode }: TableProps) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <caption className="sr-only">Contacts du fichier</caption>
        <thead className="sticky top-0 bg-muted text-left">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-medium">Contact</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Adresse</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Groupe</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((r, i) => {
            const name = partnerName(r.line);
            return (
              <tr key={i} className="border-t align-top">
                <th scope="row" className="px-2 py-1.5 text-left font-normal">
                  <span className="font-medium">{name}</span>
                  {r.line.lastName && r.line.company && <span className="block text-xs text-muted-foreground">{r.line.company}</span>}
                  {r.duplicateOf && (
                    <label className="mt-1 block text-xs">
                      <span className="font-medium text-amber-900">Déjà dans le carnet ({r.duplicateOf}) :</span>
                      <select value={r.mode} onChange={(e) => onMode(i, MODES.find((m) => m === e.target.value) ?? "keep")} className={`${SELECT_CLASS} mt-1 block w-full`}>
                        {MODES.map((m) => <option key={m} value={m}>{DUPLICATE_LABELS[m]}</option>)}
                      </select>
                    </label>
                  )}
                </th>
                <td className="px-2 py-1.5 text-xs">{r.line.addressQuery ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5">
                  <select value={r.groupId ?? ""} onChange={(e) => onGroup(i, e.target.value)} aria-label={`Groupe de ${name}`} className={`${SELECT_CLASS} w-40`}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
