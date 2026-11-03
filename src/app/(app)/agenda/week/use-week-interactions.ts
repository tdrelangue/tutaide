"use client";

import { useState } from "react";
import type { DayView, EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import type { MissedDialogProps } from "../appointments/shared-contracts";
import type { EntryAction } from "./entry-menu";
import { addDays, localToday, mondayOf, timeRange } from "./format";
import type { MoveTarget } from "./move-dialog";
import type { NotesTarget } from "../notes/notes-dialog";
import type { DurationTarget } from "./duration-dialog";
import type { WeekCommands } from "./use-week-commands";
import type { WeekData } from "./use-week-data";

export type MissedItem = NonNullable<MissedDialogProps["item"]>;

/** Which dialog is open (« Déplacer… », « N'a pas eu lieu », « Nouveau rendez-vous ») and how each closes. */
function useWeekDialogState(data: WeekData) {
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [missed, setMissed] = useState<MissedItem | null>(null);
  const [isAppointmentOpen, setIsAppointmentOpen] = useState(false);
  const [notes, setNotes] = useState<NotesTarget | null>(null);
  /** « Supprimer le rendez-vous… »: kept while the dialog closes, so its title never goes blank. */
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  /** « Préparer ma proposition ». */
  const [isPreparing, setIsPreparing] = useState(false);
  function openPrepare() {
    setIsPreparing(true);
  }
  function closePrepare() {
    setIsPreparing(false);
  }
  /** « Ce jour… »: office half-day, reschedule. */
  const [openDay, setOpenDay] = useState<DayView | null>(null);
  function closeDay() {
    setOpenDay(null);
  }
  /** « Durée pour cette fois… ». */
  const [resizing, setResizing] = useState<DurationTarget | null>(null);
  function closeResize() {
    setResizing(null);
  }
  /** « Modifier le rendez-vous… »: the appointment behind the block. */
  const [editingId, setEditingId] = useState<string | null>(null);
  function closeEdit() {
    setEditingId(null);
  }

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

  function askDelete(target: { id: string; title: string }) {
    setDeleting(target);
    setIsDeleteOpen(true);
  }

  return { moving, setMoving, missed, setMissed, isAppointmentOpen, setIsAppointmentOpen, notes, setNotes, closeNotes, closeMove, handleMissedOpenChange, handleDialogDone, openAppointment, deleting, isDeleteOpen, setIsDeleteOpen, askDelete, editingId, setEditingId, closeEdit, resizing, setResizing, closeResize, openDay, setOpenDay, closeDay, isPreparing, openPrepare, closePrepare };
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
  const { setMoving, setMissed, setNotes, askDelete, setEditingId, setResizing } = dialogs;

  function handleEntryAction(action: EntryAction, entry: EntryView, day: DayView) {
    if (action === "move") setMoving({ entry, date: day.date });
    else if (action === "unpin") void commands.unpin(entry);
    else if (action === "skip") void commands.skip(entry);
    else if (action === "duration") setResizing({ entry, dayLabel: day.label });
    else if (action === "edit" && entry.appointmentId) setEditingId(entry.appointmentId);
    else if (action === "delete" && entry.appointmentId) askDelete({ id: entry.appointmentId, title: entry.title });
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
