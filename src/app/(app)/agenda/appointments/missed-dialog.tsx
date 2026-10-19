"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IsoDate } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { markMissed } from "../planning-actions";
import { useAgendaQuery } from "../use-agenda-query";
import { addDays, formatDayLong, localToday, mondayOf } from "./format";
import { InlineError } from "./inline-error";
import type { MissedDialogProps } from "./shared-contracts";

type Item = NonNullable<MissedDialogProps["item"]>;

const CONSEQUENCES: Record<Item["kind"], string> = {
  VISIT: "La visite redevient à faire : elle sera reproposée en priorité Normale au moins.",
  APPT: "Il sera replacé la semaine prochaine, dans la liste « à placer ».",
  BLOCK: "Ce créneau sera noté comme n'ayant pas eu lieu.",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Rule 11: « N'a pas eu lieu » on a past validated item. Cancel is the default (and focused) choice. */
export function MissedDialog({ open, onOpenChange, item, onDone }: MissedDialogProps) {
  const [otherWindow, setOtherWindow] = useState(false);
  const [from, setFrom] = useState<IsoDate>(() => addDays(mondayOf(localToday()), 7));
  const [to, setTo] = useState<IsoDate>(() => addDays(mondayOf(localToday()), 11));
  const [windowError, setWindowError] = useState<string | null>(null);
  const query = useAgendaQuery();

  function handleOpenChange(next: boolean) {
    if (!next) {
      query.clearError();
      setWindowError(null);
      setOtherWindow(false);
    }
    onOpenChange(next);
  }

  function chosenWindow(): { from: IsoDate; to: IsoDate } | undefined | null {
    if (item?.kind !== "APPT" || !otherWindow) return undefined;
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from) {
      setWindowError("Indiquez une période valide : la dernière date doit suivre la première.");
      return null;
    }
    return { from, to };
  }

  async function handleConfirm() {
    if (!item) return;
    setWindowError(null);
    const period = chosenWindow();
    if (period === null) return;
    const result = await query.run(() => markMissed(item.itemKey, period));
    if (result === null) return;
    toast.success(result.requeued ? "C'est noté : il sera reproposé." : "C'est noté.");
    onDone();
    handleOpenChange(false);
  }

  const dateText = item && ISO_DATE.test(item.date) ? ` du ${formatDayLong(item.date)}` : "";
  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>« {item?.title ?? ""} »{dateText} n&apos;a pas eu lieu ?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? CONSEQUENCES[item.kind] : ""} Il ne compte plus comme fait et reste dans l&apos;historique, marqué « annulé ».
          </AlertDialogDescription>
        </AlertDialogHeader>
        {item?.kind === "APPT" && (
          <WindowChooser
            otherWindow={otherWindow}
            onOtherWindow={setOtherWindow}
            from={from}
            to={to}
            onFrom={setFrom}
            onTo={setTo}
            error={windowError}
            disabled={query.isBusy}
          />
        )}
        <InlineError message={query.error} issues={query.issues} focusOnShow />
        <AlertDialogFooter>
          {/* Safe path prominent and focused first (Radix focuses Cancel); marking de-emphasised. */}
          <AlertDialogCancel disabled={query.isBusy} className={buttonVariants()}>Annuler</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={handleConfirm}
            disabled={query.isBusy || !item}
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            {query.isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmer : n&apos;a pas eu lieu
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type WindowChooserProps = {
  readonly otherWindow: boolean;
  readonly onOtherWindow: (value: boolean) => void;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly onFrom: (value: IsoDate) => void;
  readonly onTo: (value: IsoDate) => void;
  readonly error: string | null;
  readonly disabled: boolean;
};

function WindowChooser({ otherWindow, onOtherWindow, from, to, onFrom, onTo, error, disabled }: WindowChooserProps) {
  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    onOtherWindow(event.target.checked);
  }
  function handleFrom(event: React.ChangeEvent<HTMLInputElement>) {
    onFrom(event.target.value);
  }
  function handleTo(event: React.ChangeEvent<HTMLInputElement>) {
    onTo(event.target.value);
  }
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Période où le replacer</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={otherWindow} onChange={handleToggle} className="h-4 w-4 accent-primary" />
        Le replacer sur une autre période
      </label>
      {otherWindow && (
        <div className="flex flex-wrap gap-4 pl-6">
          <div className="space-y-1">
            <Label htmlFor="missed-from">Entre le</Label>
            <Input id="missed-from" type="date" value={from} onChange={handleFrom} className="w-44" aria-invalid={error ? "true" : "false"} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="missed-to">et le</Label>
            <Input id="missed-to" type="date" value={to} onChange={handleTo} className="w-44" aria-invalid={error ? "true" : "false"} aria-describedby={error ? "missed-window-error" : undefined} />
          </div>
        </div>
      )}
      {error && <p id="missed-window-error" role="alert" className={ERROR_TEXT}>{error}</p>}
    </fieldset>
  );
}
