"use client";

import type { RefObject } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Wand2 } from "lucide-react";
import { BusyButton } from "./busy-button";

type WeekToolbarProps = {
  readonly label: string;
  /** Focus target when the control the user acted on disappears (validation, unpin, skip). */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
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

/** Week label and navigation on the left, the two main actions on the right. Buttons stay focusable while busy. */
export function WeekToolbar(props: WeekToolbarProps) {
  const { label, headingRef, busy, isProposing, hasProposal, canPlan, onPrevious, onToday, onNext, onPropose, onNewAppointment } = props;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <BusyButton variant="outline" size="icon" onClick={onPrevious} busy={busy} aria-label="Semaine précédente">
          <ChevronLeft aria-hidden="true" />
        </BusyButton>
        <BusyButton variant="outline" onClick={onToday} busy={busy}>
          Aujourd&apos;hui
        </BusyButton>
        <BusyButton variant="outline" size="icon" onClick={onNext} busy={busy} aria-label="Semaine suivante">
          <ChevronRight aria-hidden="true" />
        </BusyButton>
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-live="polite"
      >
        {label}
      </h2>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <BusyButton variant="outline" onClick={onNewAppointment} busy={busy}>
          <CalendarPlus aria-hidden="true" />
          Nouveau rendez-vous
        </BusyButton>
        <BusyButton onClick={onPropose} busy={busy} disabled={!canPlan}>
          {isProposing ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Wand2 aria-hidden="true" />}
          {hasProposal ? "Recalculer la proposition" : "Préparer une proposition"}
        </BusyButton>
      </div>
    </div>
  );
}
