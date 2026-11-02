"use client";

import type { ImportConflict } from "@/lib/agenda/contacts-import";
import { Button } from "@/components/ui/button";

type Props = {
  conflicts: ImportConflict[];
  /** Lines of the file whose address / phone replace the agenda's. */
  replace: ReadonlySet<number>;
  onChange: (replace: ReadonlySet<number>) => void;
};

function Values({ label, address, phone }: { label: string; address: string | null; phone: string | null }) {
  return (
    <p>
      <span className="text-muted-foreground">{label} : </span>
      {address ?? "pas d'adresse"}
      {phone && <> · {phone}</>}
    </p>
  );
}

/**
 * Persons of the file already in the agenda with another address or phone:
 * for each, keep the agenda's (default — nothing is lost by accident) or
 * replace it with the file's (Thomas, 2026-11-02).
 */
export function ImportConflicts({ conflicts, replace, onChange }: Props) {
  function choose(index: number, isReplacing: boolean) {
    const next = new Set(replace);
    if (isReplacing) next.add(index);
    else next.delete(index);
    onChange(next);
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 font-medium">
        {conflicts.length === 1
          ? "1 personne est déjà dans l'agenda avec une autre adresse ou un autre téléphone"
          : `${conflicts.length} personnes sont déjà dans l'agenda avec une autre adresse ou un autre téléphone`}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(new Set())}>Tout garder</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(new Set(conflicts.map((c) => c.index)))}>
          Tout remplacer par le fichier
        </Button>
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {conflicts.map((conflict) => {
          const name = `conflict-${conflict.index}`;
          const isReplacing = replace.has(conflict.index);
          return (
            <li key={conflict.index} className="space-y-1 rounded-md bg-muted/40 p-2">
              <p className="font-medium">{conflict.name}</p>
              <Values label="Dans l'agenda" address={conflict.current.address} phone={conflict.current.phone} />
              <Values label="Dans le fichier" address={conflict.file.address} phone={conflict.file.phone} />
              <div role="radiogroup" aria-label={`Pour ${conflict.name}`} className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2">
                  <input type="radio" name={name} checked={!isReplacing} onChange={() => choose(conflict.index, false)} />
                  Garder celle de l&apos;agenda
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={name} checked={isReplacing} onChange={() => choose(conflict.index, true)} />
                  Remplacer par le fichier
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
