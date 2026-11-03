"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppointmentInput } from "@/lib/agenda/appointments";
import type { EditView } from "@/lib/agenda/views/types";
import { getAppointmentForEdit, saveAppointmentEdit } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { AppointmentForm } from "./appointment-form";
import { formatItem, localToday } from "./format";
import { valuesFromInput, type FormValues } from "./form-model";
import { InlineError } from "./inline-error";
import type { PersonOption } from "./shared-contracts";

type EditDialogProps = {
  /** The appointment to change; null = closed. */
  readonly appointmentId: string | null;
  readonly onClose: () => void;
  readonly persons: readonly PersonOption[];
  /** Called after a save: the caller reloads its data. */
  readonly onDone: () => void;
};

/** What happened to the planning, in one sentence. */
function savedMessage(view: EditView): string {
  if (view.validated) return "Rendez-vous modifié et validé au planning.";
  if (view.cancelled > 0) return "Rendez-vous modifié. Sa date n'est plus dans les dates choisies : il sera replacé dans la prochaine proposition.";
  if (view.kept > 0) return "Rendez-vous modifié, le planning est à jour.";
  return "Rendez-vous modifié : il sera placé dans la prochaine proposition.";
}

/** Loads the stored appointment once per opening; null while loading or after a failure. */
function useStoredValues(appointmentId: string | null) {
  const [values, setValues] = useState<FormValues | null>(null);
  const load = useAgendaQuery();
  const { run } = load;
  useEffect(() => {
    setValues(null);
    if (appointmentId === null) return;
    let isCurrent = true;
    void run(() => getAppointmentForEdit(appointmentId)).then((input: AppointmentInput | null) => {
      if (isCurrent && input !== null) setValues(valuesFromInput(input, localToday()));
    });
    return () => {
      isCurrent = false;
    };
  }, [appointmentId, run]);
  return { values, load };
}

/**
 * « Modifier le rendez-vous » (Thomas, 2026-11-03): the same form as
 * « Nouveau rendez-vous », filled in. Its validated items to come follow the change.
 */
export function EditAppointmentDialog({ appointmentId, onClose, persons, onDone }: EditDialogProps) {
  const { values, load } = useStoredValues(appointmentId);
  const save = useAgendaQuery();
  const isBusy = save.isBusy;

  async function handleSubmit(input: AppointmentInput) {
    if (appointmentId === null) return;
    const view = await save.run(() => saveAppointmentEdit(appointmentId, input));
    if (view === null) return;
    toast.success(savedMessage(view));
    if (view.conflicts.length > 0) {
      toast.warning(`Il chevauche : ${view.conflicts.map(formatItem).join(" ; ")}. Déplacez ce qui doit l'être.`, { duration: 12_000 });
    }
    onDone();
    onClose();
  }
  function handleOpenChange(next: boolean) {
    if (!next && !isBusy) onClose();
  }
  function handleCancel() {
    onClose();
  }

  return (
    <Dialog open={appointmentId !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" closeDisabled={isBusy}>
        <DialogHeader>
          <DialogTitle>Modifier le rendez-vous</DialogTitle>
          <DialogDescription>
            Durée, lieu, personnes, date : s&apos;il est déjà au planning, il y est mis à jour.
          </DialogDescription>
        </DialogHeader>
        {values === null ? (
          load.error ? (
            <InlineError message={load.error} issues={load.issues} focusOnShow />
          ) : (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement du rendez-vous…
            </p>
          )
        ) : (
          <AppointmentForm
            key={appointmentId}
            persons={persons}
            defaultParticipantIds={values.participantIds}
            initial={values}
            submitLabel="Enregistrer les modifications"
            isBusy={isBusy}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          >
            <InlineError message={save.error} issues={save.issues} focusOnShow />
          </AppointmentForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
