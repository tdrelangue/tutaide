"use client";

/** « Rendez-vous » tab: past items to confirm, appointments to place, planned, done and cancelled. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppointmentRow, EntryView } from "@/lib/agenda/views/types";
import { getItemsToConfirm, listAppointments } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { AppointmentDialog } from "./appointment-dialog";
import { AppointmentGroups } from "./appointment-list";
import { ConfirmPanel } from "./confirm-panel";
import type { MissedItem } from "./confirm-panel";
import { DeleteAppointmentDialog } from "./delete-dialog";
import { InlineError } from "./inline-error";
import { MissedDialog } from "./missed-dialog";
import type { PersonOption } from "./shared-contracts";

export type AppointmentsTabProps = {
  /** Protected persons that can take part in an appointment. */
  readonly persons: readonly PersonOption[];
};

export function AppointmentsTab({ persons }: AppointmentsTabProps) {
  const [rows, setRows] = useState<readonly AppointmentRow[] | null>(null);
  const [toConfirm, setToConfirm] = useState<readonly EntryView[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [missed, setMissed] = useState<{ open: boolean; item: MissedItem | null }>({ open: false, item: null });
  const [toDelete, setToDelete] = useState<{ open: boolean; row: AppointmentRow | null }>({ open: false, row: null });
  const addRef = useRef<HTMLButtonElement>(null);
  const { run: runList, isBusy, error } = useAgendaQuery();
  const { run: runConfirm } = useAgendaQuery();

  const reload = useCallback(async () => {
    const [list, entries] = await Promise.all([runList(listAppointments), runConfirm(getItemsToConfirm)]);
    if (list !== null) setRows(list);
    // The reminder is secondary: on failure it simply stays as it was.
    if (entries !== null) setToConfirm(entries);
  }, [runList, runConfirm]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function handleRetry() {
    void reload();
  }

  function handleNew() {
    setIsCreating(true);
  }

  function handleMissed(item: MissedItem) {
    setMissed({ open: true, item });
  }

  function handleMissedOpenChange(open: boolean) {
    setMissed((current) => ({ ...current, open }));
  }

  function handleDelete(row: AppointmentRow) {
    setToDelete({ open: true, row });
  }

  function handleDeleteOpenChange(open: boolean) {
    setToDelete((current) => ({ ...current, open }));
  }

  function handleDeleted() {
    void reload();
    // The row is gone: give focus a stable place.
    addRef.current?.focus();
  }

  function handleChanged() {
    void reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Audiences, banque, rendez-vous avec une famille… Indiquez quand ils peuvent avoir lieu : Tutellia les place dans vos tournées.
        </p>
        <Button ref={addRef} onClick={handleNew} className="ml-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nouveau rendez-vous
        </Button>
      </div>

      <ConfirmPanel entries={toConfirm} onMissed={handleMissed} />
      <TabBody rows={rows} isBusy={isBusy} error={error} onRetry={handleRetry} onNew={handleNew} onDelete={handleDelete} />

      <AppointmentDialog open={isCreating} onOpenChange={setIsCreating} persons={persons} onDone={handleChanged} />
      <MissedDialog open={missed.open} onOpenChange={handleMissedOpenChange} item={missed.item} onDone={handleChanged} />
      <DeleteAppointmentDialog open={toDelete.open} onOpenChange={handleDeleteOpenChange} row={toDelete.row} onDone={handleDeleted} />
    </div>
  );
}

type TabBodyProps = {
  readonly rows: readonly AppointmentRow[] | null;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly onNew: () => void;
  readonly onDelete: (row: AppointmentRow) => void;
};

function TabBody({ rows, isBusy, error, onRetry, onNew, onDelete }: TabBodyProps) {
  if (error && rows === null) return <InlineError message={error} onRetry={onRetry} />;
  if (rows === null) return <ListSkeleton isBusy={isBusy} />;
  return (
    <>
      {error && <InlineError message={error} onRetry={onRetry} />}
      {rows.length === 0 ? <EmptyState onNew={onNew} /> : <AppointmentGroups rows={rows} onDelete={onDelete} />}
    </>
  );
}

function ListSkeleton({ isBusy }: { readonly isBusy: boolean }) {
  return (
    <div aria-busy={isBusy} className="space-y-2">
      <p className="sr-only" role="status">Chargement des rendez-vous…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { readonly onNew: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Aucun rendez-vous pour l&apos;instant. Ajoutez-en un : à heure fixe, dans une semaine, ou entre deux dates.
      </p>
      <Button variant="outline" onClick={onNew}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Ajouter un rendez-vous
      </Button>
    </div>
  );
}
