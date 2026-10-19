"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BusyButton } from "../week/busy-button";
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

/** Which items may move, the exact preview, and the two explicit ways out (apply, or change nothing). */
function useMoves(view: NeedsInsert, onPlaced: () => void) {
  const [movable, setMovable] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<MovesPreview | null>(null);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const previewQuery = useAgendaQuery();
  const applyQuery = useAgendaQuery();
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  function toggle(key: string, checked: boolean) {
    const others = movable.filter((k) => k !== key);
    setMovable(checked ? [...others, key] : others);
    // The previous preview no longer matches the choice.
    setPreview(null);
    setConfirmRemovals(false);
  }
  async function showPreview() {
    const result = await previewQuery.run(() => previewInsertMoves(view.appointmentId, movable));
    setConfirmRemovals(false);
    setPreview(result);
  }
  async function apply() {
    if (!preview) return;
    const done = await applyQuery.run(() => applyInsertMoves(view.appointmentId, movable, preview.fingerprint, confirmRemovals));
    if (done === null) return;
    toast.success("Changements appliqués au planning.");
    onPlaced();
  }
  /** « Ne rien changer »: the preview goes away, nothing is applied; focus returns to « Voir les changements ». */
  function discard() {
    setPreview(null);
    setConfirmRemovals(false);
    applyQuery.clearError();
    previewButtonRef.current?.focus();
  }

  const isBusy = previewQuery.isBusy || applyQuery.isBusy;
  return { movable, preview, confirmRemovals, setConfirmRemovals, previewQuery, applyQuery, previewButtonRef, isBusy, toggle, showPreview, apply, discard };
}

/**
 * Rule 6: the user ticks which validated items may move (none by default),
 * sees exactly what would change, and applies it explicitly. Removals need
 * their own confirmation.
 */
export function MovesSection({ view, onPlaced }: MovesSectionProps) {
  const moves = useMoves(view, onPlaced);
  const { preview, previewQuery, applyQuery, isBusy } = moves;

  function handlePreview() {
    void moves.showPreview();
  }
  function handleApply() {
    void moves.apply();
  }

  if (view.candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun rendez-vous validé à venir ne peut être décalé.</p>;
  }
  return (
    <div className="space-y-4">
      <CandidateList view={view} movable={moves.movable} disabled={isBusy} onToggle={moves.toggle} />
      <BusyButton ref={moves.previewButtonRef} type="button" variant="outline" onClick={handlePreview} busy={isBusy} disabled={moves.movable.length === 0}>
        {previewQuery.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Voir les changements
      </BusyButton>
      <InlineError message={previewQuery.error} issues={previewQuery.issues} focusOnShow />
      {preview && (
        <PreviewView preview={preview} confirmRemovals={moves.confirmRemovals} onConfirmRemovals={moves.setConfirmRemovals} isBusy={isBusy} onApply={handleApply} onDiscard={moves.discard}>
          <InlineError message={applyQuery.error} issues={applyQuery.issues} focusOnShow />
        </PreviewView>
      )}
    </div>
  );
}

type CandidateListProps = {
  readonly view: NeedsInsert;
  readonly movable: readonly string[];
  readonly disabled: boolean;
  readonly onToggle: (key: string, checked: boolean) => void;
};

function CandidateList({ view, movable, disabled, onToggle }: CandidateListProps) {
  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    onToggle(event.target.value, event.target.checked);
  }
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm">Cochez les rendez-vous validés que Tutellia peut déplacer. Rien ne bouge avant votre confirmation.</legend>
      {view.candidates.map((item) => (
        // min-h-6: a ≥ 24 px target (WCAG 2.5.8).
        <label key={item.itemKey} className="flex min-h-6 items-start gap-2 text-sm">
          <input type="checkbox" value={item.itemKey} checked={movable.includes(item.itemKey)} onChange={handleToggle} className="mt-0.5 h-4 w-4 accent-primary" />
          {formatItem(item)}
        </label>
      ))}
    </fieldset>
  );
}

function changeText(change: Change): string {
  const from = `${formatDayShort(change.from.date)} ${formatTime(change.from.start)}`;
  if (change.to === null) return `${change.title} : ${from} → sort du planning (plus de place)`;
  return `${change.title} : ${from} → ${formatDayShort(change.to.date)} ${formatTime(change.to.start)}`;
}

function ChangeList({ preview }: { readonly preview: MovesPreview }) {
  return (
    <ul className="space-y-1 pl-1">
      {preview.changes.length === 0 && preview.bent.length === 0 && <li>Rien d&apos;autre.</li>}
      {preview.changes.map((change) => (
        <li key={change.itemKey} className={change.to === null ? "rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-medium text-destructive" : undefined}>
          {changeText(change)}
        </li>
      ))}
      {preview.bent.map((label) => <li key={label}>Exception à la règle « {label} »</li>)}
    </ul>
  );
}

type PreviewViewProps = {
  readonly preview: MovesPreview;
  readonly confirmRemovals: boolean;
  readonly onConfirmRemovals: (value: boolean) => void;
  readonly isBusy: boolean;
  readonly onApply: () => void;
  readonly onDiscard: () => void;
  readonly children: React.ReactNode;
};

function PreviewView({ preview, confirmRemovals, onConfirmRemovals, isBusy, onApply, onDiscard, children }: PreviewViewProps) {
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
  const needsConfirm = preview.hasRemovals && !confirmRemovals;
  return (
    <section ref={ref} tabIndex={-1} aria-label="Changements prévus" className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <p>Nouveau rendez-vous : <span className="font-medium">{formatSlot(preview.placement)}</span></p>
      <p className="font-medium">Ce qui change exactement :</p>
      <ChangeList preview={preview} />
      {preview.hasRemovals && (
        <label className="flex min-h-6 items-start gap-2 font-medium text-destructive">
          <input type="checkbox" checked={confirmRemovals} onChange={handleConfirmChange} className="mt-0.5 h-4 w-4 accent-destructive" />
          Je confirme que ce rendez-vous sort du planning
        </label>
      )}
      {children}
      <PreviewActions isBusy={isBusy} needsConfirm={needsConfirm} onApply={onApply} onDiscard={onDiscard} />
    </section>
  );
}

type PreviewActionsProps = { readonly isBusy: boolean; readonly needsConfirm: boolean; readonly onApply: () => void; readonly onDiscard: () => void };

/** The safe way out is the prominent one (cognitive-bias rule); applying stays outlined. Both stay focusable while busy. */
function PreviewActions({ isBusy, needsConfirm, onApply, onDiscard }: PreviewActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <BusyButton type="button" onClick={onDiscard} busy={isBusy}>
        Ne rien changer
      </BusyButton>
      <BusyButton type="button" variant="outline" onClick={onApply} busy={isBusy} disabled={needsConfirm}>
        {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Appliquer ces changements
      </BusyButton>
    </div>
  );
}
