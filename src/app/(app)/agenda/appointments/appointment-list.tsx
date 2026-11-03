"use client";

import { useId, useState } from "react";
import { ChevronDown, Clock, ListChecks, MapPin, Pencil, Trash2, Users } from "lucide-react";
import { NotesDialog } from "../notes/notes-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDuration } from "@/lib/agenda/rules";
import type { AppointmentRow, IsoDate } from "@/lib/agenda/views/types";
import { formatDayLong, formatWhen, PRIORITY_CLASS, PRIORITY_LABELS, STATUS_CLASS, statusLabel } from "./format";

type ListProps = {
  readonly rows: readonly AppointmentRow[];
  readonly onDelete: (row: AppointmentRow) => void;
  /** « Modifier » (Thomas, 2026-11-03): offered while it can still happen. */
  readonly onEdit: (row: AppointmentRow) => void;
};

/** First day the appointment can happen: sort key. */
function startOf(row: AppointmentRow): IsoDate {
  if (row.scheduledOn) return row.scheduledOn;
  return row.when.kind === "FIXED" ? row.when.date : row.when.from;
}

function byStart(a: AppointmentRow, b: AppointmentRow): number {
  return startOf(a).localeCompare(startOf(b));
}

/** À placer, Prévus, then « Passés et annulés » folded away (rule 9: kept, without cluttering the view). */
export function AppointmentGroups({ rows, onDelete, onEdit }: ListProps) {
  const toPlace = rows.filter((r) => r.status === "A_PLACER").sort(byStart);
  const planned = rows.filter((r) => r.status === "PREVU").sort(byStart);
  const past = rows.filter((r) => r.status === "FAIT" || r.status === "ANNULE").sort((a, b) => byStart(b, a));
  return (
    <div className="space-y-6">
      <Group title="À placer ou à valider" hint="Tutellia les placera dans la prochaine proposition. Ceux à date et heure fixes sont validés dès leur saisie." rows={toPlace} onDelete={onDelete} onEdit={onEdit} />
      <Group title="Prévus" hint="Dans le planning validé." rows={planned} onDelete={onDelete} onEdit={onEdit} />
      {past.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 rounded-md text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
            Passés et annulés ({past.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <RowList rows={past} onDelete={onDelete} onEdit={onEdit} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function Group({ title, hint, rows, onDelete, onEdit }: ListProps & { readonly title: string; readonly hint: string }) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id={headingId} className="text-sm font-semibold">{title} ({rows.length})</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <RowList rows={rows} onDelete={onDelete} onEdit={onEdit} />
    </section>
  );
}

function RowList({ rows, onDelete, onEdit }: ListProps) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((row) => <Row key={row.id} row={row} onDelete={onDelete} onEdit={onEdit} />)}
    </ul>
  );
}

function Row({ row, onDelete, onEdit }: { readonly row: AppointmentRow } & Pick<ListProps, "onDelete" | "onEdit">) {
  const isPast = row.status === "FAIT" || row.status === "ANNULE";
  const people = row.participantNames.length > 0 ? `Avec ${row.participantNames.join(", ")}` : "Rendez-vous personnel";
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  function handleDelete() {
    onDelete(row);
  }
  function handleEdit() {
    onEdit(row);
  }
  return (
    <li className={`flex flex-wrap items-start gap-3 px-4 py-3 ${isPast ? "text-muted-foreground" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${isPast ? "" : "text-foreground"}`}>{row.title}</span>
          <Badge variant="outline" className={STATUS_CLASS[row.status]}>{statusLabel(row)}</Badge>
          <Badge variant="outline" className={PRIORITY_CLASS[row.priority]}>
            <span className="sr-only">Priorité </span>{PRIORITY_LABELS[row.priority].label}
          </Badge>
        </div>
        <p className="text-sm">
          {formatWhen(row.when)}
          {row.scheduledOn && row.when.kind !== "FIXED" && <span className="text-muted-foreground"> · placé le {formatDayLong(row.scheduledOn)}</span>}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{people}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{row.placeLabel}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatDuration(row.durationMin)}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => setIsNotesOpen(true)} aria-label={`Notes et tâches de « ${row.title} »`}>
          <ListChecks className="mr-1 h-4 w-4" aria-hidden="true" />
          Notes et tâches
        </Button>
        {!isPast && (
          <Button variant="ghost" size="sm" onClick={handleEdit} aria-label={`Modifier « ${row.title} »`}>
            <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
            Modifier
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleDelete} aria-label={`Supprimer « ${row.title} »`}>
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
          Supprimer
        </Button>
      </div>
      <NotesDialog target={isNotesOpen ? { key: row.id, title: row.title, when: formatWhen(row.when) } : null} onClose={() => setIsNotesOpen(false)} />
    </li>
  );
}
