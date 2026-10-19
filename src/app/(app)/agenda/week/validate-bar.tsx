"use client";

import { useState } from "react";
import { AlertTriangle, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
import type { ProposalMeta } from "@/lib/agenda/views/types";
import { BusyButton } from "./busy-button";
import { km, openPoints, plural } from "./format";

type ValidateBarProps = {
  readonly proposal: ProposalMeta;
  readonly busy: boolean;
  readonly isValidating: boolean;
  readonly error: string | null;
  readonly onValidate: () => void;
  readonly onRecompute: () => void;
};

/** « 1 question sans réponse, 1 incontournable non placé »; empty when nothing is left open. */
function pendingText(proposal: ProposalMeta): string {
  const { questions, alerts } = openPoints(proposal);
  return [
    questions > 0 ? plural(questions, "question sans réponse", "questions sans réponse") : null,
    alerts > 0 ? plural(alerts, "incontournable non placé", "incontournables non placés") : null,
  ]
    .filter((p): p is string => p !== null)
    .join(", ");
}

/**
 * Sticky at the bottom while a proposal is on screen. Validation happens only on this click, never automatically.
 * With open points left, a light confirmation comes first, « Revoir » being the default (focused) choice.
 */
export function ValidateBar({ proposal, busy, isValidating, error, onValidate, onRecompute }: ValidateBarProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const pending = pendingText(proposal);

  function handleValidate() {
    if (pending) setIsConfirming(true);
    else onValidate();
  }
  function handleConfirm() {
    setIsConfirming(false);
    onValidate();
  }

  return (
    <div className="sticky bottom-0 z-30 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          <span className="font-medium">{`${plural(proposal.placedCount, "visite", "visites")} · ${km(proposal.totalKm)}`}</span>
          <span className="block text-xs text-muted-foreground">Une fois validée, la semaine devient votre planning et ne bouge plus toute seule.</span>
        </p>
        {/* Always mounted, so a change in what is left open is announced. */}
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium">
          {pending && <AlertTriangle className="h-4 w-4 shrink-0 text-agenda-warn" aria-hidden="true" />}
          {pending}
        </p>
        <BusyButton className="ml-auto" onClick={handleValidate} busy={busy}>
          {isValidating ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
          Valider la semaine
        </BusyButton>
      </div>
      {error && <ValidateError error={error} busy={busy} onRecompute={onRecompute} />}
      <ConfirmValidateDialog open={isConfirming} onOpenChange={setIsConfirming} pending={pending} onConfirm={handleConfirm} />
    </div>
  );
}

function ValidateError({ error, busy, onRecompute }: { error: string; busy: boolean; onRecompute: () => void }) {
  return (
    <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive p-2 text-sm">
      <p>
        <span className="font-semibold">La semaine n&apos;a pas été validée.</span> {error} Si le planning a changé entre-temps,
        recalculez la proposition puis validez à nouveau.
      </p>
      <BusyButton size="sm" variant="outline" onClick={onRecompute} busy={busy}>
        <RefreshCw aria-hidden="true" />
        Recalculer
      </BusyButton>
    </div>
  );
}

type ConfirmValidateDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pending: string;
  readonly onConfirm: () => void;
};

/** « Revoir » is the safe, prominent and focused path (Radix focuses Cancel); validating anyway is de-emphasised. */
function ConfirmValidateDialog({ open, onOpenChange, pending, onConfirm }: ConfirmValidateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Valider quand même ?</AlertDialogTitle>
          <AlertDialogDescription>
            Il reste {pending}. Une fois validée, la semaine devient votre planning et ne bouge plus toute seule.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={buttonVariants()}>Revoir</AlertDialogCancel>
          {/* text-foreground: AlertDialogAction's primary text colour would otherwise stay on the outline background. */}
          <AlertDialogAction className={cn(buttonVariants({ variant: "outline" }), "text-foreground")} onClick={onConfirm}>
            Valider quand même
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
