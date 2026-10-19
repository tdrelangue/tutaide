"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FolderInput, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { END_REASON_LABELS, formatDuration, formatFrequency } from "@/lib/agenda/rules";
import type { AgendaPersonView } from "@/lib/agenda/service";
import type { IsoDate, VisitStatusRow } from "@/lib/agenda/views/types";
import { formatDayPlain } from "./appointments/format";
import { InlineError } from "./appointments/inline-error";
import { ERROR_TEXT, PrecisionBadge } from "./address-field";
import { PersonDialog } from "./person-dialog";
import { importAgendaPersons, removeAgendaPerson } from "./actions";
import { getVisitStatus } from "./planning-actions";
import { useAgendaQuery } from "./use-agenda-query";
import { useAgendaAction } from "./use-agenda-action";

type Props = {
  persons: AgendaPersonView[];
  importableCount: number;
  defaultVisitMinutes: number;
};

/** Dialog state: closed, a new person, or an existing one. */
type Editing = { person: AgendaPersonView | null } | null;

/** « Vu le / Prévu le / Prochaine visite » by person id; null while loading. */
type VisitStatuses = ReadonlyMap<string, VisitStatusRow> | null;

/** Loads the visit dates on mount and whenever the list of persons changes. */
function useVisitStatuses(persons: AgendaPersonView[]) {
  const [statuses, setStatuses] = useState<VisitStatuses>(null);
  const { run, error } = useAgendaQuery();

  const load = useCallback(async () => {
    const rows = await run(getVisitStatus);
    if (rows !== null) setStatuses(new Map(rows.map((row) => [row.personId, row])));
  }, [run]);

  useEffect(() => {
    void load();
  }, [load, persons]);

  return { statuses, error, reload: load };
}

export function PersonsTab({ persons, importableCount, defaultVisitMinutes }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<AgendaPersonView | null>(null);
  /** Kept while the confirmation closes, so its title never reads "undefined". */
  const [deleteName, setDeleteName] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const importAction = useAgendaAction();
  const deleteAction = useAgendaAction();
  const visits = useVisitStatuses(persons);

  const active = persons.filter((p) => p.status === "ACTIVE");
  const paused = persons.filter((p) => p.status === "PAUSED");
  const ended = persons.filter((p) => p.status === "ENDED");
  const withoutAddress = active.filter((p) => p.address === null).length;

  async function handleImport() {
    await importAction.run(importAgendaPersons);
  }

  async function handleConfirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    if (await deleteAction.run(() => removeAgendaPerson(id))) {
      setToDelete(null);
      // The row is gone: give focus a stable place.
      addRef.current?.focus();
    }
  }

  function askDelete(person: AgendaPersonView) {
    setDeleteName(person.fullName);
    setToDelete(person);
  }

  function handleVisitsRetry() {
    void visits.reload();
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) setEditing(null);
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setToDelete(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {active.length} personne{active.length > 1 ? "s" : ""} à visiter
            {paused.length > 0 && ` (sans compter ${paused.length} en pause)`}
          </p>
          {withoutAddress > 0 && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-900">
              {withoutAddress === 1
                ? "1 personne n'a pas d'adresse : elle ne pourra pas être planifiée."
                : `${withoutAddress} personnes n'ont pas d'adresse : elles ne pourront pas être planifiées.`}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {importableCount > 0 && (
            <Button variant="outline" onClick={handleImport} disabled={importAction.isBusy}>
              {importAction.isBusy
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <FolderInput className="mr-2 h-4 w-4" aria-hidden="true" />}
              Importer depuis mes dossiers ({importableCount})
            </Button>
          )}
          <Button ref={addRef} onClick={() => setEditing({ person: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter une personne
          </Button>
        </div>
      </div>

      {persons.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune personne dans l&apos;agenda pour l&apos;instant.
          {importableCount > 0
            ? " Importez les personnes de vos dossiers APA, ASH et PCH, puis indiquez leur adresse."
            : " Ajoutez les personnes que vous visitez, avec leur adresse et la fréquence des visites."}
        </div>
      )}

      {visits.error && persons.length > 0 && (
        <InlineError message={`Les dates de visite n'ont pas pu être chargées. ${visits.error}`} onRetry={handleVisitsRetry} />
      )}

      <PersonTable title="À visiter" rows={active} statuses={visits.statuses} defaultVisitMinutes={defaultVisitMinutes} onEdit={setEditing} onDelete={askDelete} />
      <PersonTable title="En pause" rows={paused} statuses={visits.statuses} defaultVisitMinutes={defaultVisitMinutes} onEdit={setEditing} onDelete={askDelete} />
      <PersonTable title="Mesures terminées" rows={ended} statuses={visits.statuses} defaultVisitMinutes={defaultVisitMinutes} onEdit={setEditing} onDelete={askDelete} />

      {editing && (
        <PersonDialog
          key={editing.person?.id ?? "new"}
          open
          onOpenChange={handleDialogOpenChange}
          person={editing.person}
          defaultVisitMinutes={defaultVisitMinutes}
        />
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {deleteName} de l&apos;agenda ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son adresse et sa fréquence de visite seront effacées. Ses dossiers ne sont pas modifiés.
              {toDelete?.fromDossiers && " Elle pourra être réimportée depuis vos dossiers."}
              {" "}Si la mesure a pris fin, préférez « Mesure terminée » dans sa fiche : l&apos;historique est conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAction.error && <p role="alert" className={ERROR_TEXT}>{deleteAction.error}</p>}
          <AlertDialogFooter>
            {/* Safe path prominent, removal de-emphasised (cognitive-bias rule). */}
            <AlertDialogCancel disabled={deleteAction.isBusy} className={buttonVariants()}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteAction.isBusy}
              className={cn(buttonVariants({ variant: "outline" }), "border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800")}
            >
              Retirer de l&apos;agenda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonTable({
  title,
  rows,
  statuses,
  defaultVisitMinutes,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: AgendaPersonView[];
  statuses: VisitStatuses;
  defaultVisitMinutes: number;
  onEdit: (editing: Editing) => void;
  onDelete: (person: AgendaPersonView) => void;
}) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 id={headingId} className="text-sm font-semibold">{title} ({rows.length})</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-labelledby={headingId}>
          <thead className="bg-muted/50 text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Nom</th>
              <th scope="col" className="px-3 py-2 font-medium">Lieu de visite</th>
              <th scope="col" className="px-3 py-2 font-medium">Fréquence</th>
              <th scope="col" className="px-3 py-2 font-medium">Durée</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Vu le</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Prévu le</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Prochaine visite</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => (
              <PersonRow key={person.id} person={person} status={statuses === null ? undefined : (statuses.get(person.id) ?? null)} defaultVisitMinutes={defaultVisitMinutes} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonRow({
  person,
  status,
  defaultVisitMinutes,
  onEdit,
  onDelete,
}: {
  person: AgendaPersonView;
  /** undefined while loading, null when the agenda has nothing for this person. */
  status: VisitStatusRow | null | undefined;
  defaultVisitMinutes: number;
  onEdit: (editing: Editing) => void;
  onDelete: (person: AgendaPersonView) => void;
}) {
  const duration = person.visitMinutes ?? defaultVisitMinutes;
  return (
    <tr className="border-t align-top">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <span className="font-medium">{person.fullName}</span>
        {person.fromDossiers && <Badge variant="outline" className="ml-2 text-xs">Issue de vos dossiers</Badge>}
        {person.status === "ENDED" && person.endReason && (
          <span className="block text-xs text-muted-foreground">{END_REASON_LABELS[person.endReason]}</span>
        )}
      </th>
      <td className="px-3 py-2">
        {person.address ? (
          <span className="flex flex-wrap items-center gap-2">
            {person.address.label}
            {person.address.precision !== "housenumber" && <PrecisionBadge precision={person.address.precision} />}
          </span>
        ) : (
          <span className="font-medium text-amber-900">Adresse à renseigner</span>
        )}
      </td>
      <td className="px-3 py-2">
        {person.visitsPerPeriod !== null && person.visitPeriod !== null
          ? formatFrequency(person.visitsPerPeriod, person.visitPeriod)
          : "Pas de visites régulières"}
      </td>
      <td className="px-3 py-2">
        {formatDuration(duration)}
        {person.visitMinutes === null && <span className="sr-only"> (durée par défaut)</span>}
      </td>
      <VisitCells person={person} status={status} />
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit({ person })} aria-label={`Modifier ${person.fullName}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(person)} aria-label={`Retirer ${person.fullName} de l'agenda`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function DateCell({ date }: { date: IsoDate | null }) {
  return <td className="whitespace-nowrap px-3 py-2">{date ? formatDayPlain(date) : <span aria-label="aucune">—</span>}</td>;
}

/** « Vu le », « Prévu le », « Prochaine visite » (rule 8). */
function VisitCells({ person, status }: { person: AgendaPersonView; status: VisitStatusRow | null | undefined }) {
  if (status === undefined) {
    return (
      <td colSpan={3} className="px-3 py-2 text-muted-foreground">
        <span aria-hidden="true">…</span><span className="sr-only">Chargement des dates de visite</span>
      </td>
    );
  }
  const isPaused = person.status === "PAUSED" || status?.paused === true;
  return (
    <>
      <DateCell date={status?.seenOn ?? null} />
      <DateCell date={status?.plannedOn ?? null} />
      {isPaused
        ? <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">En pause</td>
        : <DateCell date={person.status === "ENDED" ? null : (status?.nextDue ?? null)} />}
    </>
  );
}
