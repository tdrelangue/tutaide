"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AppointmentRow } from "@/lib/agenda/views/types";
import { removeAppointment } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { InlineError } from "./inline-error";

type DeleteAppointmentDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Kept while the dialog closes, so its title never goes blank. */
  readonly row: AppointmentRow | null;
  readonly onDone: () => void;
};

export function DeleteAppointmentDialog({ open, onOpenChange, row, onDone }: DeleteAppointmentDialogProps) {
  const query = useAgendaQuery();

  function handleOpenChange(next: boolean) {
    if (!next) query.clearError();
    onOpenChange(next);
  }

  async function handleConfirm() {
    if (!row) return;
    const done = await query.run(() => removeAppointment(row.id));
    if (done === null) return;
    toast.success("Rendez-vous supprimé.");
    handleOpenChange(false);
    onDone();
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {row?.title ?? ""} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ses rendez-vous validés à venir seront annulés. Ceux déjà passés restent dans l&apos;historique.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <InlineError message={query.error} issues={query.issues} focusOnShow />
        <AlertDialogFooter>
          {/* Safe path prominent, removal de-emphasised (cognitive-bias rule). */}
          <AlertDialogCancel disabled={query.isBusy} className={buttonVariants()}>Annuler</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={handleConfirm}
            disabled={query.isBusy || row === null}
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            {query.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Supprimer le rendez-vous
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
