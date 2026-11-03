"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GroupTag } from "@/lib/agenda/groups-rules";
import type { Place } from "@/lib/agenda/service";
import { listContactGroups, quickAddContact, type QuickContact } from "../actions";
import { ERROR_TEXT } from "../address-field";
import { SELECT_CLASS } from "./form-model";

type Props = {
  /** The name typed in « Avec qui ? »; null = closed. */
  readonly name: string | null;
  /** The appointment's own address (« À l'extérieur »), offered as the contact's. */
  readonly address: Place | null;
  readonly onClose: () => void;
  readonly onCreated: (contact: QuickContact) => void;
};

/**
 * « Ajouter « X » comme contact » (Thomas, 2026-11-03): a name the address
 * book does not know, saved in the group chosen, with the appointment's
 * address if the user wants it. It joins the appointment at once.
 */
export function QuickContactDialog({ name, address, onClose, onCreated }: Props) {
  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {name !== null && <Body key={name} name={name} address={address} onClose={onClose} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function useContactGroups() {
  const [groups, setGroups] = useState<GroupTag[]>([]);
  useEffect(() => {
    let isCurrent = true;
    void listContactGroups().then((result) => {
      if (isCurrent && result.success) setGroups(result.data);
    });
    return () => {
      isCurrent = false;
    };
  }, []);
  return groups;
}

function Body({ name: typed, address, onClose, onCreated }: Props & { readonly name: string }) {
  const id = useId();
  const groups = useContactGroups();
  const [name, setName] = useState(typed);
  const [groupId, setGroupId] = useState<string>("");
  const [useAddress, setUseAddress] = useState(address !== null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const result = await quickAddContact({ name, groupId: groupId === "" ? null : groupId, address: useAddress ? address : null });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
      onClose();
    } catch {
      setError("Erreur inattendue. Réessayez.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Ajouter comme contact</DialogTitle>
        <DialogDescription>Il rejoint le carnet d&apos;adresses et ce rendez-vous. Vous pourrez compléter sa fiche dans « Contacts ».</DialogDescription>
      </DialogHeader>
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`}>Nom</Label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoComplete="off" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-group`}>Groupe de contacts</Label>
        <select id={`${id}-group`} value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`${SELECT_CLASS} w-full`}>
          <option value="">{groups[0] ? `Par défaut (${groups[0].name})` : "Par défaut"}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {address && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={useAddress} onChange={(e) => setUseAddress(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>Utiliser l&apos;adresse du rendez-vous comme adresse du contact : {address.label}</span>
        </label>
      )}
      {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={isBusy}>
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Ajouter le contact
        </Button>
      </DialogFooter>
    </form>
  );
}
