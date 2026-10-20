"use client";

import { useState } from "react";
import type { DayView, EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import type { MissedDialogProps } from "../appointments/shared-contracts";
import type { EntryAction } from "./entry-menu";
import { addDays, localToday, mondayOf, timeRange } from "./format";
import type { MoveTarget } from "./move-dialog";
import type { NotesTarget } from "../notes/notes-dialog";
import type { WeekCommands } from "./use-week-commands";
import type { WeekData } from "./use-week-data";

export type MissedItem = NonNullable<MissedDialogProps["item"]>;

/** Which dialog is open (« Déplacer… », « N'a pas eu lieu », « Nouveau rendez-vous ») and how each closes. */
function useWeekDialogState(data: WeekData) {
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [missed, setMissed] = useState<MissedItem | null>(null);
  const [isAppointmentOpen, setIsAppointmentOpen] = useState(false);
  const [notes, setNotes] = useState<NotesTarget | null>(null);

  function closeMove() {
    setMoving(null);
  }
  function handleMissedOpenChange(open: boolean) {
    if (!open) setMissed(null);
  }
  /** After a dialog changed something: fresh data (and a fresh proposal if one is on screen). */
  function handleDialogDone() {
    void data.reload();
  }
  function openAppointment() {
    setIsAppointmentOpen(true);
  }

  function closeNotes() {
    setNotes(null);
  }

  return { moving, setMoving, missed, setMissed, isAppointmentOpen, setIsAppointmentOpen, notes, setNotes, closeNotes, closeMove, handleMissedOpenChange, handleDialogDone, openAppointment };
}

/** Week navigation: previous, next, and the server's « today ». */
function useWeekNavigation(data: WeekData) {
  function goPrevious() {
    data.goTo(addDays(data.from, -7));
  }
  function goNext() {
    data.goTo(addDays(data.from, 7));
  }
  function goToday() {
    data.goTo(mondayOf(data.view?.today ?? localToday()));
  }
  return { goPrevious, goNext, goToday };
}

/** Dialog state and the handlers wiring the grid, toolbar and dialogs to the week's data and commands. */
export function useWeekInteractions(data: WeekData, commands: WeekCommands) {
  const dialogs = useWeekDialogState(data);
  const navigation = useWeekNavigation(data);
  const { setMoving, setMissed, setNotes } = dialogs;

  function handleEntryAction(action: EntryAction, entry: EntryView, day: DayView) {
    if (action === "move") setMoving({ entry, date: day.date });
    else if (action === "unpin") void commands.unpin(entry);
    else if (action === "skip") void commands.skip(entry);
    else if (action === "notes" && entry.itemKey !== null) setNotes({ key: entry.itemKey, title: entry.title, when: `${day.label}, ${timeRange(entry.start, entry.end)}` });
    else if (action === "missed" && entry.itemKey !== null) {
      setMissed({ itemKey: entry.itemKey, title: entry.title, date: day.date, kind: entry.kind });
    }
  }
  function handleDrop(entry: EntryView, date: IsoDate, start: Minutes) {
    commands.pin(entry, date, start);
  }
  function handleMoveConfirm(entry: EntryView, date: IsoDate, start: Minutes) {
    setMoving(null);
    commands.pin(entry, date, start);
  }

  return { ...dialogs, ...navigation, handleEntryAction, handleDrop, handleMoveConfirm };
}

export type WeekInteractions = ReturnType<typeof useWeekInteractions>;
