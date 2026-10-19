"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DialogFooter } from "@/components/ui/dialog";
import type { InsertView, ItemRef } from "@/lib/agenda/views/types";
import { placeInSlot } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { formatItem, formatSlot } from "./format";
import { InlineError } from "./inline-error";
import { MovesSection } from "./moves-section";

export type NeedsInsert = Extract<InsertView, { kind: "NEEDS_INSERT" }>;
type SlotOption = NeedsInsert["options"][number];

const KM = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function detour(option: SlotOption): string {
  return option.addKm < 0.5 ? "sans détour" : `+${KM.format(option.addKm)} km`;
}

type InsertStepProps = {
  readonly view: NeedsInsert;
  /** The appointment was placed: close and reload. */
  readonly onPlaced: () => void;
  /** Keep it « à placer ». */
  readonly onLater: () => void;
};

/** Rule 12 / rule 6: a free slot first (nothing moves); moves only if the user allows them, after an exact preview. */
export function InsertStep({ view, onPlaced, onLater }: InsertStepProps) {
  const [chosen, setChosen] = useState<number | null>(view.options.length > 0 ? 0 : null);
  const query = useAgendaQuery();

  async function handlePlace() {
    const slot = chosen === null ? undefined : view.options[chosen];
    if (!slot) return;
    const done = await query.run(() => placeInSlot(view.appointmentId, slot.date, slot.start));
    if (done === null) return;
    toast.success(`Rendez-vous placé : ${formatSlot(slot)}.`);
    onPlaced();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-agenda-warn bg-agenda-warn-soft p-3 text-sm">
        <p className="font-medium">La semaine concernée est déjà validée.</p>
        <p>Le rendez-vous est enregistré. Choisissez un créneau libre : rien d&apos;autre ne bouge.</p>
      </div>
      <ConflictWarning conflicts={view.conflicts} />
      <SlotPicker options={view.options} chosen={chosen} onChoose={setChosen} disabled={query.isBusy} />
      <InlineError message={query.error} issues={query.issues} focusOnShow />
      {view.options.length > 0 && (
        <Button type="button" onClick={handlePlace} disabled={query.isBusy || chosen === null}>
          {query.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Placer ici
        </Button>
      )}
      <MovesSectionToggle view={view} onPlaced={onPlaced} defaultOpen={view.options.length === 0} />
      <DialogFooter className="flex-col items-stretch gap-1 sm:flex-col sm:items-end">
        <Button type="button" variant="outline" onClick={onLater}>Annuler</Button>
        <p className="text-xs text-muted-foreground">Le rendez-vous reste « à placer » dans l&apos;onglet Rendez-vous.</p>
      </DialogFooter>
    </div>
  );
}

function ConflictWarning({ conflicts }: { readonly conflicts: readonly ItemRef[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-md border border-agenda-warn p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-agenda-warn" aria-hidden="true" />
      <div>
        <p className="font-medium">Attention : déjà prévu à heure fixe sur ce moment</p>
        <ul className="list-disc pl-5">
          {conflicts.map((item) => <li key={item.itemKey}>{formatItem(item)}</li>)}
        </ul>
      </div>
    </div>
  );
}

type SlotPickerProps = {
  readonly options: readonly SlotOption[];
  readonly chosen: number | null;
  readonly onChoose: (index: number) => void;
  readonly disabled: boolean;
};

function SlotPicker({ options, chosen, onChoose, disabled }: SlotPickerProps) {
  function handleChoose(event: React.ChangeEvent<HTMLInputElement>) {
    onChoose(Number(event.target.value));
  }
  if (options.length === 0) {
    return <p className="text-sm">Aucun créneau libre sans décaler un rendez-vous validé. Vous pouvez autoriser des décalages ci-dessous.</p>;
  }
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">Créneaux libres</legend>
      {options.map((option, index) => (
        <label key={`${option.date}-${option.start}`} className="flex min-h-6 cursor-pointer items-center gap-3 rounded-md border p-2 text-sm has-[:checked]:border-agenda-held has-[:checked]:bg-agenda-held-soft">
          <input type="radio" name="insert-slot" value={index} checked={chosen === index} onChange={handleChoose} className="h-4 w-4 accent-primary" />
          <span className="font-medium">{formatSlot(option)}</span>
          <span className="ml-auto text-muted-foreground">{detour(option)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function MovesSectionToggle({ view, onPlaced, defaultOpen }: { readonly view: NeedsInsert; readonly onPlaced: () => void; readonly defaultOpen: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Autoriser des décalages
        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3">
        <MovesSection view={view} onPlaced={onPlaced} />
      </CollapsibleContent>
    </Collapsible>
  );
}
