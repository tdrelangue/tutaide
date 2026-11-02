"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { nextFreeColor, type GroupColor, type GroupKindValue } from "@/lib/agenda/groups-rules";
import type { AgendaGroupView } from "@/lib/agenda/groups";
import { ERROR_TEXT } from "./address-field";
import { moveAgendaGroupAction, removeAgendaGroup, saveAgendaGroup } from "./actions";
import { ColorPicker, GroupDot } from "./group-badge";
import { useAgendaAction } from "./use-agenda-action";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AgendaGroupView[];
  /** Persons to visit (the MJPM's) or partners (the structure's address book). */
  kind?: GroupKindValue;
};

const TEXTS: Readonly<Record<GroupKindValue, { title: string; description: string; members: (n: number) => string; placeholder: string }>> = {
  PERSONS: {
    title: "Groupes de personnes",
    description:
      "Rangez les personnes par groupe (« Mesures », « Ad hoc »…) : la couleur les repère dans la liste et sur le planning. Le premier groupe reçoit les personnes ajoutées sans groupe.",
    members: (n) => (n === 0 ? "aucune personne" : `${n} personne${n > 1 ? "s" : ""}`),
    placeholder: "ex. Ad hoc",
  },
  PARTNERS: {
    title: "Groupes de contacts",
    description:
      "Rangez vos contacts par métier (« Avocats », « Notaires »…). Ces groupes sont communs à toute votre structure. Le premier groupe reçoit les contacts ajoutés sans groupe.",
    members: (n) => (n === 0 ? "aucun contact" : `${n} contact${n > 1 ? "s" : ""}`),
    placeholder: "ex. Banques",
  },
};

/** The group being edited: an existing one, or a new one (id null). */
type Draft = { id: string | null; name: string; color: GroupColor };

/**
 * « Groupes » (Thomas, 2026-11-02): the user makes their own groups (« Ad
 * hoc »…), renames them and changes their colour. The first group receives
 * the persons added without a group.
 */
export function GroupsDialog({ open, onOpenChange, groups, kind = "PERSONS" }: Props) {
  const texts = TEXTS[kind];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<AgendaGroupView | null>(null);
  const action = useAgendaAction();

  function startNew() {
    setDraft({ id: null, name: "", color: nextFreeColor(groups.map((g) => g.color)) });
  }

  function startEdit(group: AgendaGroupView) {
    setDraft({ id: group.id, name: group.name, color: group.color });
  }

  async function handleSave(saved: Draft) {
    if (await action.run(() => saveAgendaGroup(saved.id, { name: saved.name, color: saved.color }, kind))) setDraft(null);
  }

  async function handleMove(group: AgendaGroupView, direction: "up" | "down") {
    await action.run(() => moveAgendaGroupAction(group.id, direction, kind));
  }

  async function handleConfirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    if (await action.run(() => removeAgendaGroup(id, kind))) setToDelete(null);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) setDraft(null);
    onOpenChange(isOpen);
  }

  const target = toDelete && groups.find((g) => g.id !== toDelete.id);
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>

        <ol className="divide-y rounded-lg border" aria-label="Groupes, dans l'ordre">
          {groups.map((group, i) => (
            <li key={group.id} className="p-2">
              {draft?.id === group.id ? (
                <GroupForm draft={draft} placeholder={texts.placeholder} isBusy={action.isBusy} onSave={handleSave} onCancel={() => setDraft(null)} />
              ) : (
                <GroupRow
                  group={group}
                  isFirst={i === 0}
                  isLast={i === groups.length - 1}
                  canDelete={groups.length > 1}
                  membersLabel={texts.members(group.count)}
                  disabled={action.isBusy}
                  onEdit={startEdit}
                  onMove={handleMove}
                  onDelete={setToDelete}
                />
              )}
            </li>
          ))}
        </ol>

        {action.error && toDelete === null && <p role="alert" className={ERROR_TEXT}>{action.error}</p>}

        {draft?.id === null ? (
          <div className="rounded-lg border p-2">
            <GroupForm draft={draft} placeholder={texts.placeholder} isBusy={action.isBusy} onSave={handleSave} onCancel={() => setDraft(null)} />
          </div>
        ) : (
          <Button variant="outline" onClick={startNew} disabled={action.isBusy} className="self-start">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nouveau groupe
          </Button>
        )}

        <AlertDialog open={toDelete !== null} onOpenChange={(isOpen) => !isOpen && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le groupe « {toDelete?.name} » ?</AlertDialogTitle>
              <AlertDialogDescription>
                {toDelete && toDelete.count > 0 && target
                  ? `Ses membres (${texts.members(toDelete.count)}) ne sont pas supprimés : ils passent dans « ${target.name} ».`
                  : "Ce groupe est vide."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {action.error && <p role="alert" className={ERROR_TEXT}>{action.error}</p>}
            <AlertDialogFooter>
              {/* Safe path prominent, removal de-emphasised (cognitive-bias rule). */}
              <AlertDialogCancel disabled={action.isBusy} className={buttonVariants()}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={action.isBusy}
                className={cn(buttonVariants({ variant: "outline" }), "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive")}
              >
                Supprimer le groupe
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

type RowProps = {
  group: AgendaGroupView;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  membersLabel: string;
  disabled: boolean;
  onEdit: (group: AgendaGroupView) => void;
  onMove: (group: AgendaGroupView, direction: "up" | "down") => void;
  onDelete: (group: AgendaGroupView) => void;
};

function GroupRow({ group, isFirst, isLast, canDelete, membersLabel, disabled, onEdit, onMove, onDelete }: RowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GroupDot color={group.color} className="h-3.5 w-3.5" />
      <span className="font-medium">{group.name}</span>
      <span className="text-sm text-muted-foreground">
        {membersLabel}
        {isFirst && " · groupe par défaut"}
      </span>
      <div className="ml-auto flex gap-1">
        <Button variant="ghost" size="sm" disabled={disabled || isFirst} onClick={() => onMove(group, "up")} aria-label={`Monter « ${group.name} »`}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" disabled={disabled || isLast} onClick={() => onMove(group, "down")} aria-label={`Descendre « ${group.name} »`}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onEdit(group)} aria-label={`Modifier « ${group.name} »`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onDelete(group)} aria-label={`Supprimer « ${group.name} »`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

type FormProps = {
  draft: Draft;
  placeholder: string;
  isBusy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
};

function GroupForm({ draft, placeholder, isBusy, onSave, onCancel }: FormProps) {
  const [name, setName] = useState(draft.name);
  const [color, setColor] = useState<GroupColor>(draft.color);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") {
      setNameError("Indiquez le nom du groupe.");
      return;
    }
    onSave({ id: draft.id, name, color });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={nameId}>{draft.id === null ? "Nom du nouveau groupe" : "Nom du groupe"}</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoFocus
          autoComplete="off"
          placeholder={placeholder}
          disabled={isBusy}
          aria-invalid={nameError ? "true" : "false"}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        {nameError && <p id={`${nameId}-error`} className={ERROR_TEXT}>{nameError}</p>}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium" aria-hidden="true">Couleur</p>
        <ColorPicker name={`${nameId}-color`} value={color} onChange={setColor} disabled={isBusy} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isBusy}>Annuler</Button>
        <Button type="submit" size="sm" disabled={isBusy}>
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {draft.id === null ? "Créer le groupe" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
