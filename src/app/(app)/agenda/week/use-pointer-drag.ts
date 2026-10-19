"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntryView, IsoDate, Minutes } from "@/lib/agenda/views/types";
import { PX_PER_MIN, pointerToStart, type GridRange } from "./grid-geometry";

/**
 * Pointer-event drag of proposed blocks (mouse, pen and touch alike; not
 * HTML5 drag and drop, which ignores touch). The card captures the pointer,
 * the ghost follows in 15-minute steps, Escape cancels. A press without
 * movement is a tap: it opens the card's menu instead.
 */

/** Movement under this many pixels is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 5;

export type DragPreview = {
  readonly entry: EntryView;
  readonly date: IsoDate;
  readonly start: Minutes;
};

type Session = {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly grabOffsetMin: number;
  readonly entry: EntryView;
  readonly fromDate: IsoDate;
  readonly onTap: () => void;
  readonly active: boolean;
};

export type DragHandlers = {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
};

type Options = {
  readonly range: GridRange;
  readonly disabled: boolean;
  readonly onDrop: (entry: EntryView, date: IsoDate, start: Minutes) => void;
};

/** The day column under the pointer (by x only: the pointer may leave the grid vertically). */
function columnAt(columns: ReadonlyMap<IsoDate, HTMLElement>, clientX: number): { date: IsoDate; rect: DOMRect } | null {
  for (const [date, element] of columns) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && clientX >= rect.left && clientX <= rect.right) return { date, rect };
  }
  return null;
}

export function usePointerDrag({ range, disabled, onDrop }: Options) {
  const columns = useRef(new Map<IsoDate, HTMLElement>());
  const session = useRef<Session | null>(null);
  const previewRef = useRef<DragPreview | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);

  const updatePreview = useCallback((next: DragPreview | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  const cancel = useCallback(() => {
    session.current = null;
    updatePreview(null);
  }, [updatePreview]);

  useEffect(() => {
    if (preview === null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, cancel]);

  /** Ref callback of a day column body, so the pointer can be located in it. */
  const registerColumn = useCallback(
    (date: IsoDate) => (element: HTMLElement | null) => {
      if (element) columns.current.set(date, element);
      else columns.current.delete(date);
    },
    [],
  );

  function begin(event: React.PointerEvent<HTMLElement>, entry: EntryView, date: IsoDate, onTap: () => void) {
    if (disabled || event.button !== 0) return;
    // Stops the menu from opening on press: it opens on tap (pointer up without movement).
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      grabOffsetMin: (event.clientY - rect.top) / PX_PER_MIN,
      entry,
      fromDate: date,
      onTap,
      active: false,
    };
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
    if (!current.active && distance < DRAG_THRESHOLD_PX) return;
    if (!current.active) session.current = { ...current, active: true };
    const column = columnAt(columns.current, event.clientX);
    const date = column?.date ?? previewRef.current?.date ?? current.fromDate;
    const top = column?.rect.top ?? columns.current.get(date)?.getBoundingClientRect().top ?? 0;
    const duration = current.entry.end - current.entry.start;
    const start = pointerToStart(event.clientY - top, current.grabOffsetMin, duration, range);
    updatePreview({ entry: current.entry, date, start });
  }

  function end(event: React.PointerEvent<HTMLElement>) {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dropped = previewRef.current;
    cancel();
    if (!current.active || !dropped) {
      current.onTap();
      return;
    }
    const unchanged = dropped.date === current.fromDate && dropped.start === current.entry.start;
    if (!unchanged) onDrop(current.entry, dropped.date, dropped.start);
  }

  /** Pointer handlers for one movable card. */
  function bind(entry: EntryView, date: IsoDate, onTap: () => void): DragHandlers {
    return {
      onPointerDown: (event) => begin(event, entry, date, onTap),
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: cancel,
    };
  }

  return { preview, registerColumn, bind };
}
