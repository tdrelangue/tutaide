"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppointmentInput } from "@/lib/agenda/appointments";
import type { InsertView, IssueView } from "@/lib/agenda/views/types";
import { addAppointment } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { AppointmentForm } from "./appointment-form";
import { InlineError, IssueList } from "./inline-error";
import { InsertStep } from "./insert-step";
import type { NeedsInsert } from "./insert-step";
import type { AppointmentDialogProps, PersonOption } from "./shared-contracts";

type Step =
  | { readonly kind: "FORM" }
  | { readonly kind: "INSERT"; readonly view: NeedsInsert }
  | { readonly kind: "UNPLANNABLE"; readonly issues: readonly IssueView[] };

const TITLES: Record<Step["kind"], { title: string; description: string }> = {
  FORM: {
    title: "Nouveau rendez-vous",
    description: "Avant validation de la semaine, il rejoint la liste et sera placé avec les autres, selon sa priorité.",
  },
  INSERT: {
    title: "Où placer ce rendez-vous ?",
    description: "Un planning validé ne bouge jamais tout seul : vous choisissez.",
  },
  UNPLANNABLE: {
    title: "Rendez-vous enregistré, mais pas encore plaçable",
    description: "Corrigez ce qui suit ; il sera placé dès que possible.",
  },
};

/** Steps of the dialog. Every opening starts afresh on the form (state adjusted while rendering, no effect). */
function useAppointmentSteps({ open, onOpenChange, onDone }: Pick<AppointmentDialogProps, "open" | "onOpenChange" | "onDone">) {
  const [step, setStep] = useState<Step>({ kind: "FORM" });
  const [formKey, setFormKey] = useState(0);
  const [refused, setRefused] = useState<readonly IssueView[]>([]);
  const [wasOpen, setWasOpen] = useState(open);
  const query = useAgendaQuery();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep({ kind: "FORM" });
      setFormKey((key) => key + 1);
      setRefused([]);
      query.clearError();
    }
  }

  function close(created: boolean) {
    if (created) onDone();
    onOpenChange(false);
  }

  function handleView(view: InsertView) {
    if (view.kind === "LISTED") {
      toast.success("Ajouté : il sera placé dans la prochaine proposition.");
      close(true);
    } else if (view.kind === "NOT_PLANNABLE") setRefused(view.issues);
    else if (view.kind === "UNPLANNABLE") setStep({ kind: "UNPLANNABLE", issues: view.issues });
    else setStep({ kind: "INSERT", view });
  }

  async function handleSubmit(input: AppointmentInput) {
    setRefused([]);
    const view = await query.run(() => addAppointment(input));
    if (view !== null) handleView(view);
  }

  return { step, formKey, refused, query, close, handleSubmit };
}

/** The title takes focus when the step changes: the submit button is gone, and the new title is read (WCAG 2.4.3). */
function useStepFocus(kind: Step["kind"]) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (kind !== "FORM") titleRef.current?.focus();
  }, [kind]);
  return titleRef;
}

/** « Nouveau rendez-vous », with the rule 12 insertion flow when its dates touch a validated week. */
export function AppointmentDialog({ open, onOpenChange, persons, defaultParticipantIds = [], onDone }: AppointmentDialogProps) {
  const flow = useAppointmentSteps({ open, onOpenChange, onDone });
  const titleRef = useStepFocus(flow.step.kind);
  const isBusy = flow.query.isBusy;

  function handleOpenChange(next: boolean) {
    if (next) onOpenChange(true);
    // A save in flight cannot be abandoned; past the form, the appointment exists: the caller must reload in any case.
    else if (!isBusy) flow.close(flow.step.kind !== "FORM");
  }
  function preventCloseWhileBusy(event: Event) {
    if (isBusy) event.preventDefault();
  }

  const heading = TITLES[flow.step.kind];
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        closeDisabled={isBusy}
        onEscapeKeyDown={preventCloseWhileBusy}
        onInteractOutside={preventCloseWhileBusy}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{heading.title}</DialogTitle>
          <DialogDescription>{heading.description}</DialogDescription>
        </DialogHeader>
        <StepBody flow={flow} persons={persons} defaultParticipantIds={defaultParticipantIds} />
      </DialogContent>
    </Dialog>
  );
}

type StepBodyProps = {
  readonly flow: ReturnType<typeof useAppointmentSteps>;
  readonly persons: readonly PersonOption[];
  readonly defaultParticipantIds: readonly string[];
};

function StepBody({ flow, persons, defaultParticipantIds }: StepBodyProps) {
  const { step, query } = flow;
  function handleCancel() {
    flow.close(false);
  }
  function handleCreatedClose() {
    flow.close(true);
  }
  if (step.kind === "INSERT") return <InsertStep view={step.view} onPlaced={handleCreatedClose} onLater={handleCreatedClose} />;
  if (step.kind === "UNPLANNABLE") {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-md border border-agenda-warn bg-agenda-warn-soft p-3">
          <IssueList issues={step.issues} />
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleCreatedClose}>Fermer</Button>
        </DialogFooter>
      </div>
    );
  }
  return (
    <AppointmentForm key={flow.formKey} persons={persons} defaultParticipantIds={defaultParticipantIds} isBusy={query.isBusy} onSubmit={flow.handleSubmit} onCancel={handleCancel}>
      <InlineError message={query.error} issues={query.issues} focusOnShow />
      {flow.refused.length > 0 && <RefusedNotice issues={flow.refused} />}
    </AppointmentForm>
  );
}

/** NOT_PLANNABLE: nothing was saved; the issues say what to fix first. */
function RefusedNotice({ issues }: { readonly issues: readonly IssueView[] }) {
  return (
    <InlineError message="Ce rendez-vous ne peut pas être planifié pour l'instant ; il n'a pas été enregistré." issues={issues} focusOnShow />
  );
}
