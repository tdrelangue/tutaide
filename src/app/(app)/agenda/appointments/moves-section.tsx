"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { InsertView, MovesPreview } from "@/lib/agenda/views/types";
import { applyInsertMoves, previewInsertMoves } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { formatDayShort, formatItem, formatSlot, formatTime } from "./format";
import { InlineError } from "./inline-error";

type NeedsInsert = Extract<InsertView, { kind: "NEEDS_INSERT" }>;
type Change = MovesPreview["changes"][number];

type MovesSectionProps = {
  readonly view: NeedsInsert;
  readonly onPlaced: () => void;
};

/**
 * Rule 6: the user ticks which validated items may move (none by default),
 * sees exactly what would change, and applies it explicitly. Removals need
 * their own confirmation.
 */
export function MovesSection({ view, onPlaced }: MovesSectionProps) {
  const [movable, setMovable] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<MovesPreview | null>(null);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const previewQuery = useAgendaQuery();
  const applyQuery = useAgendaQuery();

  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    const key = event.target.value;
    const others = movable.filter((k) => k !== key);
    setMovable(event.target.checked ? [...others, key] : others);
    // The previous preview no longer matches the choice.
    setPreview(null);
    setConfirmRemovals(false);
  }

  async function handlePreview() {
    const result = await previewQuery.run(() => previewInsertMoves(view.appointmentId, movable));
    setConfirmRemovals(false);
    setPreview(result);
  }

  async function handleApply() {
    if (!preview) return;
    const done = await applyQuery.run(() => applyInsertMoves(view.appointmentId, movable, preview.fingerprint, confirmRemovals));
    if (done === null) return;
    toast.success("Changements appliqués au planning.");
    onPlaced();
  }

  if (view.candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun rendez-vous validé à venir ne peut être décalé.</p>;
  }
  const isBusy = previewQuery.isBusy || applyQuery.isBusy;
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={isBusy}>
        <legend className="text-sm">Cochez les rendez-vous validés que Tutellia peut déplacer. Rien ne bouge avant votre confirmation.</legend>
        {view.candidates.map((item) => (
          <label key={item.itemKey} className="flex items-start gap-2 text-sm">
            <input type="checkbox" value={item.itemKey} checked={movable.includes(item.itemKey)} onChange={handleToggle} className="mt-0.5 h-4 w-4 accent-primary" />
            {formatItem(item)}
          </label>
        ))}
      </fieldset>
      <Button type="button" variant="outline" onClick={handlePreview} disabled={isBusy || movable.length === 0}>
        {previewQuery.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Voir les changements
      </Button>
      <InlineError message={previewQuery.error} issues={previewQuery.issues} focusOnShow />
      {preview && (
        <PreviewView preview={preview} confirmRemovals={confirmRemovals} onConfirmRemovals={setConfirmRemovals} isBusy={isBusy} onApply={handleApply}>
          <InlineError message={applyQuery.error} issues={applyQuery.issues} focusOnShow />
        </PreviewView>
      )}
    </div>
  );
}

function changeText(change: Change): string {
  const from = `${formatDayShort(change.from.date)} ${formatTime(change.from.start)}`;
  if (change.to === null) return `${change.title} : ${from} → sort du planning (plus de place)`;
  return `${change.title} : ${from} → ${formatDayShort(change.to.date)} ${formatTime(change.to.start)}`;
}

type PreviewViewProps = {
  readonly preview: MovesPreview;
  readonly confirmRemovals: boolean;
  readonly onConfirmRemovals: (value: boolean) => void;
  readonly isBusy: boolean;
  readonly onApply: () => void;
  readonly children: React.ReactNode;
};

function PreviewView({ preview, confirmRemovals, onConfirmRemovals, isBusy, onApply, children }: PreviewViewProps) {
  const ref = useRef<HTMLElement>(null);
  // A new preview: bring the user (and screen readers) to it.
  useEffect(() => {
    ref.current?.focus();
  }, [preview]);

  function handleConfirmChange(event: React.ChangeEvent<HTMLInputElement>) {
    onConfirmRemovals(event.target.checked);
  }
  if (preview.placement === null) {
    return <p role="status" className="text-sm font-medium">Impossible de placer le rendez-vous, même avec ces décalages. Autorisez-en d&apos;autres, ou laissez-le « à placer ».</p>;
  }
  const canApply = !isBusy && (!preview.hasRemovals || confirmRemovals);
  return (
    <section ref={ref} tabIndex={-1} aria-label="Changements prévus" className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <p>Nouveau rendez-vous : <span className="font-medium">{formatSlot(preview.placement)}</span></p>
      <p className="font-medium">Ce qui change exactement :</p>
      <ul className="space-y-1 pl-1">
        {preview.changes.length === 0 && preview.bent.length === 0 && <li>Rien d&apos;autre.</li>}
        {preview.changes.map((change) => (
          <li key={change.itemKey} className={change.to === null ? "rounded border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-800" : undefined}>
            {changeText(change)}
          </li>
        ))}
        {preview.bent.map((label) => <li key={label}>Exception à la règle « {label} »</li>)}
      </ul>
      {preview.hasRemovals && (
        <label className="flex items-start gap-2 font-medium text-red-800">
          <input type="checkbox" checked={confirmRemovals} onChange={handleConfirmChange} className="mt-0.5 h-4 w-4 accent-red-700" />
          Je confirme que ce rendez-vous sort du planning
        </label>
      )}
      {children}
      <Button type="button" variant="outline" onClick={onApply} disabled={!canApply}>
        {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Appliquer ces changements
      </Button>
    </section>
  );
}
