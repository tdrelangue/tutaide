"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EntryView } from "@/lib/agenda/views/types";
import { DurationField } from "../duration-field";
import { InlineError } from "../appointments/inline-error";
import { setVisitDuration } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { BusyButton } from "./busy-button";

export type DurationTarget = { readonly entry: EntryView; readonly dayLabel: string };

type Props = {
  readonly target: DurationTarget | null;
  readonly onClose: () => void;
  /** Called after a change: the caller reloads the week (and its proposal). */
  readonly onDone: () => void;
};

/**
 * « Durée pour cette fois… » (Thomas, 2026-11-03): « j'ai beaucoup à lui faire
 * signer » or « juste un petit truc, 15 minutes ». This visit only; the
 * person's usual length stays on her file.
 */
export function DurationDialog({ target, onClose, onDone }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target && <DurationBody key={target.entry.key} target={target} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function DurationBody({ target, onClose, onDone }: Props & { readonly target: DurationTarget }) {
  const { entry, dayLabel } = target;
  const [minutes, setMinutes] = useState<number | null>(entry.end - entry.start);
  const query = useAgendaQuery();
  const isProposed = entry.source === "PROPOSED" && entry.occurrenceKey !== null;

  async function save(value: number | null) {
    const key = isProposed && entry.occurrenceKey !== null ? { occurrenceKey: entry.occurrenceKey } : { itemKey: entry.itemKey ?? "" };
    const done = await query.run(() => setVisitDuration(key, value));
    if (done === null) return;
    toast.success(value === null ? "Durée habituelle rétablie pour cette visite." : "Durée enregistrée pour cette visite.");
    onDone();
    onClose();
  }
  function handleSave() {
    void save(minutes);
  }
  function handleUsual() {
    void save(null);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Durée pour cette fois</DialogTitle>
        <DialogDescription>
          {entry.title}, {dayLabel}. Seulement cette visite : la durée habituelle reste sur la fiche.
          {isProposed ? " La proposition est recalculée avec la nouvelle durée." : " L'heure de début ne change pas."}
        </DialogDescription>
      </DialogHeader>
      <DurationField id="visit-once-duration" label="Durée" value={minutes} onChange={setMinutes} min={5} choices={[15, 30, 45, 60, 90, 120, 180]} />
      <InlineError message={query.error} issues={query.issues} focusOnShow />
      <DialogFooter className="gap-2">
        {isProposed && (
          <Button type="button" variant="ghost" onClick={handleUsual} disabled={query.isBusy}>
            Revenir à la durée habituelle
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        <BusyButton type="button" onClick={handleSave} busy={query.isBusy}>Enregistrer</BusyButton>
      </DialogFooter>
    </>
  );
}
