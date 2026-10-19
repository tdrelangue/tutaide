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
import type { AppointmentDialogProps } from "./shared-contracts";

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

/** « Nouveau rendez-vous », with the rule 12 insertion flow when its dates touch a validated week. */
export function AppointmentDialog({ open, onOpenChange, persons, defaultParticipantIds = [], onDone }: AppointmentDialogProps) {
  const [step, setStep] = useState<Step>({ kind: "FORM" });
  const [formKey, setFormKey] = useState(0);
  const [refused, setRefused] = useState<readonly IssueView[]>([]);
  const stepRef = useRef<HTMLDivElement>(null);
  const query = useAgendaQuery();

  // The submit button disappears with the form: give focus a place in the new step.
  useEffect(() => {
    if (step.kind !== "FORM") stepRef.current?.focus();
  }, [step]);

  function close(created: boolean) {
    if (created) onDone();
    setStep({ kind: "FORM" });
    setFormKey((key) => key + 1);
    setRefused([]);
    query.clearError();
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) onOpenChange(true);
    // Past the form, the appointment exists: the caller must reload in any case.
    else close(step.kind !== "FORM");
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

  function handleCancel() {
    close(false);
  }

  function handleCreatedClose() {
    close(true);
  }

  const heading = TITLES[step.kind];
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{heading.title}</DialogTitle>
          <DialogDescription>{heading.description}</DialogDescription>
        </DialogHeader>
        {step.kind === "FORM" && (
          <AppointmentForm key={formKey} persons={persons} defaultParticipantIds={defaultParticipantIds} isBusy={query.isBusy} onSubmit={handleSubmit} onCancel={handleCancel}>
            <InlineError message={query.error} issues={query.issues} focusOnShow />
            {refused.length > 0 && <RefusedNotice issues={refused} />}
          </AppointmentForm>
        )}
        <div ref={stepRef} tabIndex={-1} className="outline-none">
          {step.kind === "INSERT" && <InsertStep view={step.view} onPlaced={handleCreatedClose} onLater={handleCreatedClose} />}
          {step.kind === "UNPLANNABLE" && (
            <div className="space-y-4">
              <div role="alert" className="rounded-md border border-agenda-warn bg-agenda-warn-soft p-3">
                <IssueList issues={step.issues} />
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleCreatedClose}>Fermer</Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** NOT_PLANNABLE: nothing was saved; the issues say what to fix first. */
function RefusedNotice({ issues }: { readonly issues: readonly IssueView[] }) {
  return (
    <InlineError message="Ce rendez-vous ne peut pas être planifié pour l'instant ; il n'a pas été enregistré." issues={issues} focusOnShow />
  );
}
