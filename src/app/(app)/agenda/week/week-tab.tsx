"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { IsoDate } from "@/lib/agenda/views/types";

import type { PersonOption } from "../appointments/shared-contracts";
import { AppointmentDialog } from "../appointments/appointment-dialog";
import { MissedDialog } from "../appointments/missed-dialog";
import { ERROR_TEXT } from "../address-field";
import { addDays, mondayOf, weekLabel } from "./format";
import { IssuesCard } from "./issues-card";
import { Legend } from "./legend";
import { MoveDialog } from "./move-dialog";
import { NotesDialog } from "../notes/notes-dialog";
import { ProposalPanel } from "./proposal-panel";
import { useWeekCommands, type FocusTargets, type WeekCommands } from "./use-week-commands";
import { useWeekData, type WeekData } from "./use-week-data";
import { useWeekInteractions, type WeekInteractions } from "./use-week-interactions";
import { ValidateBar } from "./validate-bar";
import { WeekGrid } from "./week-grid";
import { BusyStatus, EmptyWeekNote, GridSkeleton, LoadError, SetupNotice, isEmptyWeek } from "./week-states";
import { WeekToolbar } from "./week-toolbar";

/** « Planning » tab: the week grid (validated plan + proposal). */
export type WeekTabProps = {
  /** No home address yet: the tab explains what to fill in instead of planning. */
  readonly needsSetup: boolean;
  /** For « Nouveau rendez-vous » (participants). */
  readonly persons: readonly PersonOption[];
  /** A day picked in the month: the week shows it (and opens it on a phone). `seq` makes each pick count. */
  readonly jumpTo?: DayJump | null;
};

export type DayJump = { readonly date: IsoDate; readonly seq: number };

/** Focus targets for when the control the user acted on disappears (WCAG 2.4.3). */
function useFocusTargets() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const proposalTitleRef = useRef<HTMLHeadingElement>(null);
  const focus = useMemo<FocusTargets>(
    () => ({
      week: () => headingRef.current?.focus(),
      // The panel title is gone with the proposal: fall back to the week heading.
      proposal: () => (proposalTitleRef.current ?? headingRef.current)?.focus(),
    }),
    [],
  );
  return { headingRef, proposalTitleRef, focus };
}

export function WeekTab({ needsSetup, persons, jumpTo = null }: WeekTabProps) {
  const data = useWeekData(!needsSetup);
  const { goTo } = data;
  useEffect(() => {
    if (jumpTo) goTo(mondayOf(jumpTo.date));
  }, [jumpTo, goTo]);
  const targets = useFocusTargets();
  const commands = useWeekCommands(data, targets.focus);
  const ui = useWeekInteractions(data, commands);
  if (needsSetup) return <SetupNotice />;

  const view = data.view;
  const busy = data.mode !== "idle" || commands.isActing || commands.isValidating;
  return (
    <div className="space-y-3">
      <WeekToolbar
        label={weekLabel(view?.from ?? data.from, view?.to ?? addDays(data.from, 6))}
        headingRef={targets.headingRef}
        busy={busy}
        isProposing={data.mode === "proposing"}
        hasProposal={view?.proposal != null}
        canPlan={view !== null}
        onPrevious={ui.goPrevious}
        onToday={ui.goToday}
        onNext={ui.goNext}
        onPropose={commands.recompute}
        onNewAppointment={ui.openAppointment}
      />
      <BusyStatus mode={data.mode} isActing={commands.isActing} isValidating={commands.isValidating} announcement={data.announcement} />
      {commands.stepError && <p role="alert" className={ERROR_TEXT}>{commands.stepError}</p>}
      <WeekContent data={data} commands={commands} ui={ui} busy={busy} proposalTitleRef={targets.proposalTitleRef} jumpTo={jumpTo} />
      {view?.proposal && (
        <ValidateBar proposal={view.proposal} busy={busy} isValidating={commands.isValidating} error={commands.validateError} onValidate={commands.validate} onRecompute={commands.recompute} />
      )}
      <WeekDialogs data={data} ui={ui} persons={persons} />
    </div>
  );
}

type ContentProps = {
  readonly data: WeekData;
  readonly commands: WeekCommands;
  readonly ui: WeekInteractions;
  readonly busy: boolean;
  readonly proposalTitleRef: RefObject<HTMLHeadingElement | null>;
  readonly jumpTo: DayJump | null;
};

function WeekContent({ data, commands, ui, busy, proposalTitleRef, jumpTo }: ContentProps) {
  const view = data.view;
  function handleRetry() {
    void data.retry();
  }
  if (view === null) {
    return (
      <div className="space-y-3">
        <IssuesCard issues={data.issues} title="La semaine ne peut pas être planifiée" />
        {data.error ? <LoadError message={data.error} onRetry={handleRetry} busy={busy} /> : <GridSkeleton />}
      </div>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="min-w-0 space-y-3">
        {data.error && <LoadError message={data.error} onRetry={handleRetry} busy={busy} />}
        <IssuesCard issues={data.issues} title="La proposition ne peut pas être préparée" />
        <IssuesCard issues={view.issues} title="Éléments que l'agenda n'a pas pu utiliser" />
        {isEmptyWeek(view) && <EmptyWeekNote />}
        {/* Re-keyed on a pick from the month, so the picked day opens even within the same week. */}
        <WeekGrid key={`${view.from}:${jumpTo?.seq ?? 0}`} view={view} busy={busy} onEntryAction={ui.handleEntryAction} onDrop={ui.handleDrop} focusDate={jumpTo?.date ?? null} />
        <Legend grid={view.grid} />
      </div>
      <ProposalPanel proposal={view.proposal} titleRef={proposalTitleRef} busy={busy} onAnswer={commands.answer} onRefuse={commands.refuse} />
    </div>
  );
}

function WeekDialogs({ data, ui, persons }: { data: WeekData; ui: WeekInteractions; persons: readonly PersonOption[] }) {
  const view = data.view;
  return (
    <>
      <MoveDialog
        target={ui.moving}
        days={view?.days ?? []}
        range={{ from: view?.grid.from ?? 0, to: view?.grid.to ?? 0 }}
        onClose={ui.closeMove}
        onConfirm={ui.handleMoveConfirm}
      />
      <MissedDialog open={ui.missed !== null} onOpenChange={ui.handleMissedOpenChange} item={ui.missed} onDone={ui.handleDialogDone} />
      <NotesDialog target={ui.notes} onClose={ui.closeNotes} />
      <AppointmentDialog open={ui.isAppointmentOpen} onOpenChange={ui.setIsAppointmentOpen} persons={persons} onDone={ui.handleDialogDone} />
    </>
  );
}
