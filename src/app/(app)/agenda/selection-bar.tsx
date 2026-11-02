"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Flag, Trash2, X } from "lucide-react";
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
import { END_REASON_LABELS } from "@/lib/agenda/rules";
import type { AgendaPersonView } from "@/lib/agenda/service";
import { ERROR_TEXT } from "./address-field";
import { endAgendaMeasures, removeAgendaPersons } from "./actions";
import { useAgendaAction } from "./use-agenda-action";

type EndReason = keyof typeof END_REASON_LABELS;
const END_REASONS = Object.keys(END_REASON_LABELS) as EndReason[]; // keys of a Record<EndReason, …>

type Props = {
  selected: ReadonlySet<string>;
  persons: AgendaPersonView[];
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
};

const personsLabel = (n: number) => `${n} personne${n > 1 ? "s" : ""}`;

/**
 * Selection mode of « Personnes »: end the measure of, or remove, many
 * persons at once — the yearly clean-up would otherwise take one click per
 * person (Thomas, 2026-11-02). Both ask for confirmation first.
 */
export function SelectionBar({ selected, persons, onSelectAll, onClear, onExit }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"end" | "remove" | null>(null);
  const [reason, setReason] = useState<EndReason>("AUTRE");
  const reasonId = useId();
  const action = useAgendaAction();
  const ids = [...selected];
  const count = ids.length;
  const notEnded = persons.filter((p) => selected.has(p.id) && p.status !== "ENDED").length;

  async function handleConfirmEnd() {
    if (await action.run(() => endAgendaMeasures(ids, reason))) {
      setDialog(null);
      onClear();
    }
  }

  async function handleConfirmRemove() {
    const isDone = await action.run(() => removeAgendaPersons(ids));
    // Some may have been removed even when others were refused: show the list as it is now.
    if (!isDone) router.refresh();
    setDialog(null);
    onClear();
  }

  function handleDialogChange(open: boolean) {
    if (!open && !action.isBusy) {
      setDialog(null);
      action.clearError();
    }
  }

  function handleReasonChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = END_REASONS.find((r) => r === event.target.value);
    if (value) setReason(value);
  }

  return (
    <div role="region" aria-label="Sélection" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
      <p className="px-2 text-sm font-medium" aria-live="polite">
        {count === 0 ? "Cochez les personnes à traiter" : `${personsLabel(count)} sélectionnée${count > 1 ? "s" : ""}`}
      </p>
      <Button variant="ghost" size="sm" onClick={onSelectAll}>
        <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
        Tout sélectionner
      </Button>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={notEnded === 0} onClick={() => setDialog("end")}>
          <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
          Mesure terminée…
        </Button>
        <Button variant="outline" size="sm" disabled={count === 0} onClick={() => setDialog("remove")} className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Retirer de l&apos;agenda…
        </Button>
        <Button variant="ghost" size="sm" onClick={onExit}>
          <X className="mr-2 h-4 w-4" aria-hidden="true" />
          Terminer la sélection
        </Button>
      </div>

      <AlertDialog open={dialog === "end"} onOpenChange={handleDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mesure terminée pour {personsLabel(notEnded)} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Leurs visites à venir ne seront plus proposées. Leur historique est conservé : elles restent dans
              « Mesures terminées ».{count > notEnded && " Celles dont la mesure est déjà terminée ne changent pas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label htmlFor={reasonId} className="text-sm font-medium">Motif</label>
            <select
              id={reasonId}
              value={reason}
              onChange={handleReasonChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {END_REASONS.map((r) => <option key={r} value={r}>{END_REASON_LABELS[r]}</option>)}
            </select>
          </div>
          {action.error && <p role="alert" className={ERROR_TEXT}>{action.error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEnd} disabled={action.isBusy}>
              Terminer {notEnded > 1 ? "ces mesures" : "cette mesure"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "remove"} onOpenChange={handleDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {personsLabel(count)} de l&apos;agenda ?</AlertDialogTitle>
            <AlertDialogDescription>
              Leurs adresses et fréquences de visite seront effacées. Leurs dossiers ne sont pas modifiés. Si leur
              mesure a pris fin, préférez « Mesure terminée » : l&apos;historique est conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Safe path prominent, removal de-emphasised (cognitive-bias rule). */}
            <AlertDialogCancel disabled={action.isBusy} className={buttonVariants()}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              disabled={action.isBusy}
              className={cn(buttonVariants({ variant: "outline" }), "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive")}
            >
              Retirer {personsLabel(count)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
