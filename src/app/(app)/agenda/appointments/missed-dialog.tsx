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

type Period = { readonly from: IsoDate; readonly to: IsoDate };

/** Next week, Monday to Friday, from the day the dialog opens (not the day the page loaded). */
function defaultWindow(): Period {
  const monday = addDays(mondayOf(localToday()), 7);
  return { from: monday, to: addDays(monday, 4) };
}

/** The dialog's state; every opening starts afresh (state adjusted while rendering, no effect). */
function useMissedState(open: boolean) {
  const [otherWindow, setOtherWindow] = useState(false);
  const [period, setPeriod] = useState<Period>(defaultWindow);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const query = useAgendaQuery();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPeriod(defaultWindow());
      setOtherWindow(false);
      setWindowError(null);
      query.clearError();
    }
  }

  function setFrom(from: IsoDate) {
    setPeriod((current) => ({ ...current, from }));
  }
  function setTo(to: IsoDate) {
    setPeriod((current) => ({ ...current, to }));
  }
  /** undefined: the usual window; null: the chosen window is invalid (error shown). */
  function chosenWindow(item: Item): Period | undefined | null {
    if (item.kind !== "APPT" || !otherWindow) return undefined;
    if (!ISO_DATE.test(period.from) || !ISO_DATE.test(period.to) || period.to < period.from) {
      setWindowError("Indiquez une période valide : la dernière date doit suivre la première.");
      return null;
    }
    return period;
  }

  return { otherWindow, setOtherWindow, period, setFrom, setTo, windowError, setWindowError, chosenWindow, query };
}

/** Rule 11: « N'a pas eu lieu » on a past validated item. Cancel is the default (and focused) choice. */
export function MissedDialog({ open, onOpenChange, item, onDone }: MissedDialogProps) {
  const state = useMissedState(open);
  const { query } = state;

  async function handleConfirm() {
    if (!item) return;
    state.setWindowError(null);
    const period = state.chosenWindow(item);
    if (period === null) return;
    const result = await query.run(() => markMissed(item.itemKey, period));
    if (result === null) return;
    toast.success(result.requeued ? "C'est noté : il sera reproposé." : "C'est noté.");
    onDone();
    onOpenChange(false);
  }

  const dateText = item && ISO_DATE.test(item.date) ? ` du ${formatDayLong(item.date)}` : "";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>« {item?.title ?? ""} »{dateText} n&apos;a pas eu lieu ?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? CONSEQUENCES[item.kind] : ""} Il ne compte plus comme fait et reste dans l&apos;historique, marqué « annulé ».
          </AlertDialogDescription>
        </AlertDialogHeader>
        {item?.kind === "APPT" && <WindowChooser state={state} disabled={query.isBusy} />}
        <InlineError message={query.error} issues={query.issues} focusOnShow />
        <MissedFooter isBusy={query.isBusy} canConfirm={item !== null} onConfirm={handleConfirm} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MissedFooter({ isBusy, canConfirm, onConfirm }: { isBusy: boolean; canConfirm: boolean; onConfirm: () => void }) {
  return (
    <AlertDialogFooter>
      {/* Safe path prominent and focused first (Radix focuses Cancel); marking de-emphasised. */}
      <AlertDialogCancel disabled={isBusy} className={buttonVariants()}>Annuler</AlertDialogCancel>
      <Button
        type="button"
        variant="outline"
        onClick={onConfirm}
        disabled={isBusy || !canConfirm}
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Confirmer : n&apos;a pas eu lieu
      </Button>
    </AlertDialogFooter>
  );
}

type WindowChooserProps = {
  readonly state: ReturnType<typeof useMissedState>;
  readonly disabled: boolean;
};

function WindowChooser({ state, disabled }: WindowChooserProps) {
  const { otherWindow, period, windowError: error } = state;
  function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    state.setOtherWindow(event.target.checked);
  }
  function handleFrom(event: React.ChangeEvent<HTMLInputElement>) {
    state.setFrom(event.target.value);
  }
  function handleTo(event: React.ChangeEvent<HTMLInputElement>) {
    state.setTo(event.target.value);
  }
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Période où le replacer</legend>
      {/* min-h-6: a ≥ 24 px target (WCAG 2.5.8). */}
      <label className="flex min-h-6 items-center gap-2 text-sm">
        <input type="checkbox" checked={otherWindow} onChange={handleToggle} className="h-4 w-4 accent-primary" />
        Le replacer sur une autre période
      </label>
      {otherWindow && (
        <div className="flex flex-wrap gap-4 pl-6">
          <div className="space-y-1">
            <Label htmlFor="missed-from">Entre le</Label>
            <Input id="missed-from" type="date" value={period.from} onChange={handleFrom} className="w-44" aria-invalid={error ? "true" : "false"} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="missed-to">et le</Label>
            <Input id="missed-to" type="date" value={period.to} onChange={handleTo} className="w-44" aria-invalid={error ? "true" : "false"} aria-describedby={error ? "missed-window-error" : undefined} />
          </div>
        </div>
      )}
      {error && <p id="missed-window-error" role="alert" className={ERROR_TEXT}>{error}</p>}
    </fieldset>
  );
}
