"use client";

import { useMemo, useState } from "react";
import { Check, FolderInput, FolderPlus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { compareByName } from "@/lib/name-sort";
import { loadNameSortBasis } from "@/lib/local-prefs";
import type { SortingTarget } from "../document-actions";
import { CreateDossierDialog } from "../create-dossier-dialog";
import { useMandataireContext } from "@/components/use-mandataire-context";
import type { SortModule } from "./use-sorting-session";

type StatusFilter = "ACTIVE" | "ALL";
/** "all" or the id of one MJPM. */
type OwnerFilter = string;
type Owner = { id: string; name: string };

interface DossierPickerProps {
  dossiers: SortingTarget[];
  moduleType: SortModule;
  onCreated: (dossier: SortingTarget) => void;
  filename: string;
  pending: SortingTarget | null;
  isBusy: boolean;
  onChoose: (dossier: SortingTarget) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function useVisibleDossiers(dossiers: SortingTarget[], filter: StatusFilter, search: string, owner: OwnerFilter) {
  return useMemo(() => {
    const basis = loadNameSortBasis();
    const query = search.trim().toLowerCase();
    return dossiers
      .filter((d) => owner === "all" || d.ownerId === owner)
      .filter((d) => filter === "ALL" || d.status === "ACTIVE")
      .filter((d) => !query || d.fullName.toLowerCase().includes(query))
      .sort((a, b) => compareByName(a.fullName, b.fullName, basis));
  }, [dossiers, filter, search, owner]);
}

/** Distinct MJPMs of the listed dossiers, by name. */
function useOwners(dossiers: SortingTarget[]): Owner[] {
  return useMemo(() => {
    const byId = new Map(dossiers.map((d) => [d.ownerId, d.ownerName]));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [dossiers]);
}

/**
 * Assistants: which MJPM's dossiers to show. Starts on the MJPM chosen in the
 * header ("Tous mes mandataires" otherwise) and can be changed here.
 */
function useOwnerFilter(owners: Owner[]): [OwnerFilter, (value: OwnerFilter) => void] {
  const { selection } = useMandataireContext(owners.length > 1);
  const [owner, setOwner] = useState<OwnerFilter | null>(null);
  const initial = owners.some((o) => o.id === selection) ? selection : "all";
  return [owner ?? initial, setOwner];
}

/** Right side of the sorting screen: pick the dossier, then confirm. */
export function DossierPicker(props: DossierPickerProps) {
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const owners = useOwners(props.dossiers);
  const [owner, setOwner] = useOwnerFilter(owners);
  const showOwners = owners.length > 1;
  const visible = useVisibleDossiers(props.dossiers, filter, search, showOwners ? owner : "all");

  if (props.pending) {
    return (
      <ConfirmBox
        filename={props.filename}
        dossier={props.pending}
        showOwner={showOwners}
        isBusy={props.isBusy}
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showOwners && <OwnerToggle owners={owners} value={owner} onChange={setOwner} />}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          placeholder="Rechercher un dossier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Rechercher un dossier"
        />
      </div>
      <StatusToggle value={filter} onChange={setFilter} />
      <DossierList dossiers={visible} showOwner={showOwners && owner === "all"} isBusy={props.isBusy} onChoose={props.onChoose} />
      <Button variant="ghost" className="h-auto justify-start whitespace-normal py-2 text-left" disabled={props.isBusy} onClick={() => setIsCreateOpen(true)}>
        <FolderPlus className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
        Aucun dossier ne convient ? Créer un nouveau dossier
      </Button>
      <CreateDossierDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        moduleType={props.moduleType}
        initialName={search.trim()}
        onCreated={props.onCreated}
        defaultOwnerId={showOwners && owner !== "all" ? owner : undefined}
      />
    </div>
  );
}

function OwnerToggle({ owners, value, onChange }: { owners: Owner[]; value: OwnerFilter; onChange: (v: OwnerFilter) => void }) {
  const options = [{ id: "all", name: "Tous mes mandataires" }, ...owners];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Mandataire">
      {options.map((option) => (
        <Button
          key={option.id}
          size="sm"
          variant={value === option.id ? "default" : "outline"}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </Button>
      ))}
    </div>
  );
}

function StatusToggle({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Dossiers affichés">
      <Button size="sm" variant={value === "ACTIVE" ? "secondary" : "ghost"} aria-pressed={value === "ACTIVE"} onClick={() => onChange("ACTIVE")}>
        Actifs
      </Button>
      <Button size="sm" variant={value === "ALL" ? "secondary" : "ghost"} aria-pressed={value === "ALL"} onClick={() => onChange("ALL")}>
        Tous (y compris clôturés)
      </Button>
    </div>
  );
}

function DossierList(props: { dossiers: SortingTarget[]; showOwner: boolean; isBusy: boolean; onChoose: (d: SortingTarget) => void }) {
  if (props.dossiers.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucun dossier ne correspond.</p>;
  }
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Dossiers">
      {props.dossiers.map((dossier) => (
        <li key={dossier.id}>
          <button
            type="button"
            disabled={props.isBusy}
            onClick={() => props.onChoose(dossier)}
            className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{dossier.fullName}</span>
              {props.showOwner && <span className="block truncate text-xs text-muted-foreground">{dossier.ownerName}</span>}
            </span>
            {dossier.status === "CLOSED" && <Badge variant="outline">Clôturé</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConfirmBox(props: {
  filename: string;
  dossier: SortingTarget;
  showOwner: boolean;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4" role="alertdialog" aria-labelledby="sorting-confirm-title">
      <FolderInput className="h-6 w-6 text-primary" aria-hidden="true" />
      <p id="sorting-confirm-title" className="text-sm">
        Ranger <span className="font-medium break-all">« {props.filename} »</span> dans le dossier{" "}
        <span className="font-semibold">{props.dossier.fullName}</span>
        {props.showOwner && <> (mandataire : {props.dossier.ownerName})</>} ?
      </p>
      {props.dossier.status === "CLOSED" && (
        <p className="text-xs text-muted-foreground">Ce dossier est clôturé.</p>
      )}
      <div className="flex gap-2">
        <Button autoFocus disabled={props.isBusy} onClick={props.onConfirm}>
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          Oui, ranger
        </Button>
        <Button variant="outline" disabled={props.isBusy} onClick={props.onCancel}>
          <X className="mr-2 h-4 w-4" aria-hidden="true" />
          Non, choisir un autre
        </Button>
      </div>
    </div>
  );
}
