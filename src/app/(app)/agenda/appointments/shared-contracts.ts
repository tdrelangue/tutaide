/**
 * Contracts between the « Planning » tab (week/) and the « Rendez-vous » tab
 * (appointments/). The dialogs live in appointments/ and are reused by the
 * week grid with exactly these props.
 */
import type { IsoDate } from "@/lib/agenda/views/types";

export type PersonOption = { readonly id: string; readonly fullName: string };

/** appointments/appointment-dialog.tsx — « Nouveau rendez-vous », including the rule 12 insertion flow. */
export type AppointmentDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly persons: readonly PersonOption[];
  /** Pre-filled participants (e.g. opened from a person). */
  readonly defaultParticipantIds?: readonly string[];
  /** Called once the appointment is listed or placed: the caller reloads its data. */
  readonly onDone: () => void;
};

/** appointments/missed-dialog.tsx — « N'a pas eu lieu » on a past validated item. */
export type MissedDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly item: { readonly itemKey: string; readonly title: string; readonly date: IsoDate; readonly kind: "VISIT" | "APPT" | "BLOCK" } | null;
  /** Called after the item was marked: the caller reloads its data. */
  readonly onDone: () => void;
};
