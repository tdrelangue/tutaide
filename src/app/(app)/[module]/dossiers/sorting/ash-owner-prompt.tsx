"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MandataireChoice } from "@/lib/access/context";

type Pending = { protegeName: string; resolve: (ownerId: string | null) => void };

/**
 * Asks an assistant (viewing all their MJPMs) which MJPM new ASH dossiers are
 * for. Asked once per drop: the answer is reused for the rest of the drop.
 * `null` = cancelled, the files go to manual sorting instead.
 */
export function useAshOwnerPrompt(choices: MandataireChoice[]) {
  const [pending, setPending] = useState<Pending | null>(null);
  const answerRef = useRef<string | null | undefined>(undefined);

  function resetForNewDrop() {
    answerRef.current = undefined;
  }

  function ask(protegeName: string): Promise<string | null> {
    if (answerRef.current !== undefined) return Promise.resolve(answerRef.current);
    return new Promise((resolve) => setPending({ protegeName, resolve }));
  }

  function answer(ownerId: string | null) {
    answerRef.current = ownerId;
    pending?.resolve(ownerId);
    setPending(null);
  }

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pour quel mandataire ?</DialogTitle>
          <DialogDescription>
            Aucun dossier ASH ne correspond à « {pending?.protegeName} ». Choisissez le mandataire
            pour qui créer les nouveaux dossiers de cet import (le choix vaut pour tout ce dépôt de
            fichiers ; le mandataire de chaque dossier créé est affiché sur sa carte).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2" role="group" aria-label="Mandataires">
          {choices.map((choice) => (
            <Button key={choice.id} variant="outline" className="justify-start" onClick={() => answer(choice.id)}>
              {choice.name}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(null)}>
            Ne pas créer : ranger ces fichiers à la main
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, resetForNewDrop, dialog };
}
