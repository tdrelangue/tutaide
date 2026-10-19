"use client";

import { CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProposalMeta } from "@/lib/agenda/views/types";
import { km, plural } from "./format";

type ValidateBarProps = {
  readonly proposal: ProposalMeta;
  readonly busy: boolean;
  readonly isValidating: boolean;
  readonly error: string | null;
  readonly onValidate: () => void;
  readonly onRecompute: () => void;
};

function recap(proposal: ProposalMeta): string {
  const alerts = proposal.problems.filter((p) => p.isAlert).length;
  const open = proposal.questions.filter((q) => q.answer === null).length;
  return [
    `${plural(proposal.placedCount, "visite", "visites")} · ${km(proposal.totalKm)}`,
    alerts > 0 ? plural(alerts, "incontournable non placé", "incontournables non placés") : null,
    open > 0 ? plural(open, "question sans réponse", "questions sans réponse") : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
}

/** Sticky at the bottom while a proposal is on screen. Validation happens only on this click, never automatically. */
export function ValidateBar({ proposal, busy, isValidating, error, onValidate, onRecompute }: ValidateBarProps) {
  return (
    <div className="sticky bottom-0 z-30 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          <span className="font-medium">{recap(proposal)}</span>
          <span className="block text-xs text-muted-foreground">Une fois validée, la semaine devient votre planning et ne bouge plus toute seule.</span>
        </p>
        <Button className="ml-auto" onClick={onValidate} disabled={busy}>
          {isValidating ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
          Valider la semaine
        </Button>
      </div>
      {error && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive p-2 text-sm">
          <p>
            <span className="font-semibold">La semaine n&apos;a pas été validée.</span> {error} Si le planning a changé entre-temps,
            recalculez la proposition puis validez à nouveau.
          </p>
          <Button size="sm" variant="outline" onClick={onRecompute} disabled={busy}>
            <RefreshCw aria-hidden="true" />
            Recalculer
          </Button>
        </div>
      )}
    </div>
  );
}
