"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, EyeOff, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { IsoDate } from "@/lib/agenda/views/types";
import { orderTowns, type PrepPerson, type PrepTown, type PreparationView, type PrepUrgency } from "@/lib/agenda/views/preparation";
import { InlineError } from "../appointments/inline-error";
import { GroupDot } from "../group-badge";
import { getPreparation, type PlanChoiceInput } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { dayShort, plural } from "./format";

const URGENCY_LABEL: Readonly<Record<PrepUrgency, string>> = { OVERDUE: "En retard", DUE: "À voir", LATER: "En avance" };
const URGENCY_CLASS: Readonly<Record<PrepUrgency, string>> = {
  OVERDUE: "border-2 border-destructive font-semibold",
  DUE: "border border-foreground/40",
  LATER: "border border-dashed border-border text-muted-foreground",
};

type Props = {
  readonly open: boolean;
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** The choice of the proposal on screen, to start from it (« Modifier mes choix »). */
  readonly initial: PlanChoiceInput;
  readonly onClose: () => void;
  readonly onOrganise: (choice: NonNullable<PlanChoiceInput>) => void;
  /** The month view prepares a month (Thomas: the view you are in decides). */
  readonly scale?: "week" | "month";
};

/**
 * « Préparer ma proposition » (Thomas, 2026-11-03): a list to tick, never
 * imposed days. One block per town, the most urgent first; inside, the
 * EHPAD and other establishments. One click takes a whole town or a whole
 * EHPAD; picking someone opens the town and brings the towns next to it up.
 * A town of no interest is hidden. Tutellia then organises exactly these
 * choices and suggests others on the way.
 */
export function PrepareDialog({ open, from, to, initial, onClose, onOrganise, scale = "week" }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Préparer ma proposition</DialogTitle>
          <DialogDescription>
            Cochez qui vous voulez voir du {dayShort(from)} au {dayShort(to)}. Les communes les plus urgentes sont en haut.
            Tutellia organise ensuite les journées et vous suggère d&apos;autres personnes en route.
          </DialogDescription>
        </DialogHeader>
        {open && <Body key={`${from}:${to}`} from={from} to={to} initial={initial} onClose={onClose} onOrganise={onOrganise} scale={scale} />}
      </DialogContent>
    </Dialog>
  );
}

function usePreparation(from: IsoDate, to: IsoDate, scale: "week" | "month") {
  const [view, setView] = useState<PreparationView | null>(null);
  const query = useAgendaQuery();
  const { run } = query;
  useEffect(() => {
    void run(() => getPreparation(from, to, scale)).then((data) => data && setView(data));
  }, [from, to, scale, run]);
  return { view, query };
}

function toggled(set: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

function Body({ from, to, initial, onClose, onOrganise, scale = "week" }: Omit<Props, "open">) {
  const { view, query } = usePreparation(from, to, scale);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial?.persons ?? []));
  const [appointments, setAppointments] = useState<Set<string> | null>(initial ? new Set(initial.appointments) : null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ordered = useMemo(() => (view ? orderTowns(view.towns, picked) : []), [view, picked]);

  if (!view) {
    return query.error ? (
      <InlineError message={query.error} issues={query.issues} focusOnShow />
    ) : (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Chargement des personnes…
      </p>
    );
  }
  // Appointments to place are all taken unless the user unticks some.
  const appts = appointments ?? new Set(view.appointments.map((a) => a.id));

  function pick(ids: readonly string[], on: boolean, townKey: string) {
    setPicked((current) => toggled(current, ids, on));
    if (on) setOpen((current) => new Set(current).add(townKey));
  }
  function toggleOpen(key: string) {
    setOpen((current) => toggled(current, [key], !current.has(key)));
  }
  function hide(key: string) {
    setHidden((current) => new Set(current).add(key));
  }
  function handleOrganise() {
    onOrganise({ persons: [...picked], appointments: [...appts] });
    onClose();
  }

  const visible = ordered.filter((o) => !hidden.has(o.town.key));
  return (
    <div className="space-y-4">
      {view.appointments.length > 0 && (
        <AppointmentList view={view} value={appts} onChange={setAppointments} />
      )}
      <ul className="space-y-2" aria-label="Communes">
        {visible.map(({ town, near }) => (
          <TownBlock
            key={town.key}
            town={town}
            near={near}
            picked={picked}
            isOpen={open.has(town.key) || town.people.some((p) => picked.has(p.id))}
            onToggleOpen={() => toggleOpen(town.key)}
            onPick={(ids, on) => pick(ids, on, town.key)}
            onHide={() => hide(town.key)}
          />
        ))}
      </ul>
      {hidden.size > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setHidden(new Set())}>
          Afficher les communes masquées ({hidden.size})
        </Button>
      )}
      <DialogFooter className="sticky bottom-0 gap-2 border-t bg-background pt-3">
        <p className="mr-auto self-center text-sm" aria-live="polite">{plural(picked.size, "personne choisie", "personnes choisies")}</p>
        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="button" onClick={handleOrganise} disabled={picked.size === 0 && appts.size === 0}>Organiser ma proposition</Button>
      </DialogFooter>
    </div>
  );
}

function AppointmentList({ view, value, onChange }: { readonly view: PreparationView; readonly value: ReadonlySet<string>; readonly onChange: (next: Set<string>) => void }) {
  return (
    <fieldset className="space-y-1 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Rendez-vous à placer</legend>
      {view.appointments.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.has(a.id)} onChange={(e) => onChange(toggled(value, [a.id], e.target.checked))} className="h-4 w-4 accent-primary" />
          {a.title} <span className="text-xs text-muted-foreground">(du {dayShort(a.from)} au {dayShort(a.to)})</span>
        </label>
      ))}
    </fieldset>
  );
}

type TownProps = {
  readonly town: PrepTown;
  readonly near: boolean;
  readonly picked: ReadonlySet<string>;
  readonly isOpen: boolean;
  readonly onToggleOpen: () => void;
  readonly onPick: (ids: readonly string[], on: boolean) => void;
  readonly onHide: () => void;
};

function townSummary(town: PrepTown): string {
  const late = town.people.filter((p) => p.urgency === "OVERDUE").length;
  const due = town.people.filter((p) => p.urgency === "DUE").length;
  const parts = [late > 0 ? `${late} en retard` : null, due > 0 ? `${due} à voir` : null, `${plural(town.people.length, "personne", "personnes")}`];
  return parts.filter((p): p is string => p !== null).join(" · ");
}

function TownBlock({ town, near, picked, isOpen, onToggleOpen, onPick, onHide }: TownProps) {
  const listId = useId();
  const ids = town.people.map((p) => p.id);
  const all = ids.length > 0 && ids.every((id) => picked.has(id));
  const inSite = new Set(town.sites.flatMap((s) => s.personIds));
  const loose = town.people.filter((p) => !inSite.has(p.id));
  return (
    <li className={cn("rounded-lg border", near && "border-primary/60")}>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          aria-controls={listId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 motion-safe:transition-transform", !isOpen && "-rotate-90")} aria-hidden="true" />
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold">{town.name}</span>
          {near && <span className="rounded border border-primary/60 px-1 text-xs">À côté</span>}
          <span className="truncate text-xs text-muted-foreground">{townSummary(town)}</span>
        </button>
        <Button type="button" size="sm" variant={all ? "outline" : "secondary"} onClick={() => onPick(ids, !all)}>
          {all ? "Tout retirer" : `Toute la commune`}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onHide} aria-label={`Masquer ${town.name}`}>
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {isOpen && (
        <div id={listId} className="space-y-2 border-t p-2">
          {town.sites.map((site) => {
            const people = town.people.filter((p) => site.personIds.includes(p.id));
            const siteAll = people.every((p) => picked.has(p.id));
            return (
              <div key={site.id} className="rounded-md border border-dashed p-2">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{site.name}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onPick(site.personIds, !siteAll)}>
                    {siteAll ? "Retirer l'établissement" : "Tout l'établissement"}
                  </Button>
                </div>
                <PeopleList people={people} picked={picked} onPick={onPick} />
              </div>
            );
          })}
          <PeopleList people={loose} picked={picked} onPick={onPick} />
        </div>
      )}
    </li>
  );
}

function PeopleList({ people, picked, onPick }: { readonly people: readonly PrepPerson[]; readonly picked: ReadonlySet<string>; readonly onPick: (ids: readonly string[], on: boolean) => void }) {
  if (people.length === 0) return null;
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {people.map((p) => (
        <li key={p.id}>
          <label className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
            <input type="checkbox" checked={picked.has(p.id)} onChange={(e) => onPick([p.id], e.target.checked)} className="h-4 w-4 accent-primary" />
            {p.group && <GroupDot color={p.group.color} />}
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className={cn("shrink-0 rounded px-1 text-xs", URGENCY_CLASS[p.urgency])}>
              {URGENCY_LABEL[p.urgency]}
              {p.due && p.urgency !== "OVERDUE" && ` · ${dayShort(p.due)}`}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
