"use client";

import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type WeekToolbarProps = {
  readonly label: string;
  readonly busy: boolean;
  readonly isProposing: boolean;
  readonly hasProposal: boolean;
  readonly canPlan: boolean;
  readonly onPrevious: () => void;
  readonly onToday: () => void;
  readonly onNext: () => void;
  readonly onPropose: () => void;
  readonly onNewAppointment: () => void;
};

/** Week label and navigation on the left, the two main actions on the right. */
export function WeekToolbar(props: WeekToolbarProps) {
  const { label, busy, isProposing, hasProposal, canPlan, onPrevious, onToday, onNext, onPropose, onNewAppointment } = props;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrevious} disabled={busy} aria-label="Semaine précédente">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={onToday} disabled={busy}>
          Aujourd&apos;hui
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} disabled={busy} aria-label="Semaine suivante">
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <h2 className="text-lg font-semibold tracking-tight" aria-live="polite">
        {label}
      </h2>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <Button variant="outline" onClick={onNewAppointment} disabled={busy}>
          <CalendarPlus aria-hidden="true" />
          Nouveau rendez-vous
        </Button>
        <Button onClick={onPropose} disabled={busy || !canPlan}>
          {isProposing ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Wand2 aria-hidden="true" />}
          {hasProposal ? "Recalculer la proposition" : "Préparer une proposition"}
        </Button>
      </div>
    </div>
  );
}
