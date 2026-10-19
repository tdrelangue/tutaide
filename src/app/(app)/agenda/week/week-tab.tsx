"use client";

import type { PersonOption } from "../appointments/shared-contracts";
import { AppointmentDialog } from "../appointments/appointment-dialog";
import { MissedDialog } from "../appointments/missed-dialog";
import { ERROR_TEXT } from "../address-field";
import { addDays, weekLabel } from "./format";
import { IssuesCard } from "./issues-card";
import { Legend } from "./legend";
import { MoveDialog } from "./move-dialog";
import { ProposalPanel } from "./proposal-panel";
import { useWeekCommands, type WeekCommands } from "./use-week-commands";
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
};

export function WeekTab({ needsSetup, persons }: WeekTabProps) {
  const data = useWeekData(!needsSetup);
  const commands = useWeekCommands(data);
  const ui = useWeekInteractions(data, commands);
  if (needsSetup) return <SetupNotice />;

  const view = data.view;
  const busy = data.mode !== "idle" || commands.isActing || commands.isValidating;
  return (
    <div className="space-y-3">
      <WeekToolbar
        label={weekLabel(view?.from ?? data.from, view?.to ?? addDays(data.from, 6))}
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
      <BusyStatus mode={data.mode} isActing={commands.isActing} isValidating={commands.isValidating} />
      {commands.stepError && <p role="alert" className={ERROR_TEXT}>{commands.stepError}</p>}
      <WeekContent data={data} commands={commands} ui={ui} busy={busy} />
      {view?.proposal && (
        <ValidateBar
          proposal={view.proposal}
          busy={busy}
          isValidating={commands.isValidating}
          error={commands.validateError}
          onValidate={commands.validate}
          onRecompute={commands.recompute}
        />
      )}
      <WeekDialogs data={data} ui={ui} persons={persons} />
    </div>
  );
}

type ContentProps = { readonly data: WeekData; readonly commands: WeekCommands; readonly ui: WeekInteractions; readonly busy: boolean };

function WeekContent({ data, commands, ui, busy }: ContentProps) {
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
        <WeekGrid key={view.from} view={view} busy={busy} onEntryAction={ui.handleEntryAction} onDrop={ui.handleDrop} />
        <Legend grid={view.grid} />
      </div>
      <ProposalPanel proposal={view.proposal} busy={busy} onAnswer={commands.answer} onRefuse={commands.refuse} />
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
      <AppointmentDialog open={ui.isAppointmentOpen} onOpenChange={ui.setIsAppointmentOpen} persons={persons} onDone={ui.handleDialogDone} />
    </>
  );
}
