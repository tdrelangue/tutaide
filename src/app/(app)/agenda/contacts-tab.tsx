"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { AgendaGroupView } from "@/lib/agenda/groups";
import { groupOf, type GroupTag } from "@/lib/agenda/groups-rules";
import { searchPersons } from "@/lib/agenda/participant-search";
import type { AgendaPartnerView } from "@/lib/agenda/partners";
import { partnerName } from "@/lib/agenda/rules";
import { ERROR_TEXT } from "./address-field";
import { removeAgendaPartner } from "./actions";
import { GroupBadge, GroupFilter } from "./group-badge";
import { GroupsDialog } from "./groups-dialog";
import type { PersonOption } from "./appointments/shared-contracts";
import { PartnerDialog } from "./partner-dialog";
import { useAgendaAction } from "./use-agenda-action";

type Props = {
  partners: AgendaPartnerView[];
  groups: AgendaGroupView[];
  /** Persons of this agenda, for « notaire de Jean Bonneau ». */
  persons: readonly PersonOption[];
};

/** Dialog state: closed, a new contact, or an existing one. */
type Editing = { partner: AgendaPartnerView | null } | null;

type Row = { readonly partner: AgendaPartnerView; readonly id: string; readonly fullName: string; readonly group: GroupTag | null };

/** Searchable by name, structure and function (« notaire »). */
function rowsOf(partners: AgendaPartnerView[], groups: AgendaGroupView[]): Row[] {
  return partners.map((p) => ({
    partner: p,
    id: p.id,
    fullName: [partnerName(p), p.company, p.role].filter((s): s is string => s !== null).join(" "),
    group: groupOf(p.groupId, groups),
  }));
}

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/**
 * « Contacts » (Thomas, 2026-11-02): the partners' address book — lawyers,
 * notaries, craftsmen… — shared by the whole structure, sorted into coloured groups.
 */
export function ContactsTab({ partners, groups, persons }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AgendaPartnerView | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const deleteAction = useAgendaAction();
  const all = rowsOf(partners, groups);
  const filterId = groups.some((g) => g.id === groupFilter) ? groupFilter : null;
  const shown = searchPersons(all, query, { groupId: filterId, limit: all.length }).matches;

  async function handleConfirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    if (await deleteAction.run(() => removeAgendaPartner(id))) {
      setToDelete(null);
      addRef.current?.focus();
    }
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) setEditing(null);
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setToDelete(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {partners.length} contact{partners.length > 1 ? "s" : ""}, communs à toute votre structure.
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsGroupsOpen(true)}>
            <Tags className="mr-2 h-4 w-4" aria-hidden="true" />
            Groupes
          </Button>
          <Button ref={addRef} onClick={() => setEditing({ partner: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter un contact
          </Button>
        </div>
      </div>

      {partners.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun contact pour l&apos;instant. Ajoutez vos avocats, notaires, artisans… avec leurs coordonnées : toute votre structure
          les retrouvera ici.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={handleQueryChange}
                aria-label="Rechercher un contact"
                placeholder="Nom, structure, fonction…"
                autoComplete="off"
                className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <GroupFilter groups={groups} value={filterId} total={partners.length} onChange={setGroupFilter} />
          </div>
          <p className="sr-only" aria-live="polite">{`${shown.length} contact${shown.length > 1 ? "s" : ""} affiché${shown.length > 1 ? "s" : ""}`}</p>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contact ne correspond.</p>
          ) : (
            <ContactTable rows={shown} onEdit={setEditing} onDelete={setToDelete} />
          )}
        </>
      )}

      {editing && (
        <PartnerDialog key={editing.partner?.id ?? "new"} open onOpenChange={handleDialogOpenChange} partner={editing.partner} groups={groups} persons={persons} />
      )}
      <GroupsDialog open={isGroupsOpen} onOpenChange={setIsGroupsOpen} groups={groups} kind="PARTNERS" />

      <AlertDialog open={toDelete !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {toDelete ? partnerName(toDelete) : "ce contact"} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ses coordonnées seront effacées pour toute votre structure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAction.error && <p role="alert" className={ERROR_TEXT}>{deleteAction.error}</p>}
          <AlertDialogFooter>
            {/* Safe path prominent, removal de-emphasised (cognitive-bias rule). */}
            <AlertDialogCancel disabled={deleteAction.isBusy} className={buttonVariants()}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteAction.isBusy}
              className={cn(buttonVariants({ variant: "outline" }), "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive")}
            >
              Supprimer le contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type TableProps = {
  rows: readonly Row[];
  onEdit: (editing: Editing) => void;
  onDelete: (partner: AgendaPartnerView) => void;
};

function ContactTable({ rows, onEdit, onDelete }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Contacts</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Nom</th>
            <th scope="col" className="px-3 py-2 font-medium">Téléphone</th>
            <th scope="col" className="px-3 py-2 font-medium">E-mail</th>
            <th scope="col" className="px-3 py-2 font-medium">Adresse</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <ContactRow key={row.id} row={row} onEdit={onEdit} onDelete={onDelete} />)}
        </tbody>
      </table>
    </div>
  );
}

function ContactRow({ row, onEdit, onDelete }: { row: Row; onEdit: (editing: Editing) => void; onDelete: (partner: AgendaPartnerView) => void }) {
  const { partner, group } = row;
  const name = partnerName(partner);
  const details = [partner.lastName ? partner.company : null, partner.role].filter((s): s is string => s !== null);
  return (
    <tr className="border-t align-top">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <span className="font-medium">{name}</span>
        {group && <GroupBadge group={group} className="ml-2" />}
        {details.length > 0 && <span className="block text-xs text-muted-foreground">{details.join(" · ")}</span>}
      </th>
      <td className="whitespace-nowrap px-3 py-2">
        {[partner.phone, partner.mobile].filter((p): p is string => p !== null).map((p) => (
          <a key={p} href={telHref(p)} className="block underline-offset-2 hover:underline">{p}</a>
        ))}
      </td>
      <td className="px-3 py-2">
        {partner.email && <a href={`mailto:${partner.email}`} className="break-all underline-offset-2 hover:underline">{partner.email}</a>}
      </td>
      <td className="px-3 py-2">{partner.address?.label}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit({ partner })} aria-label={`Modifier ${name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(partner)} aria-label={`Supprimer ${name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
