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

export type BindDrag = (entry: EntryView, date: IsoDate, onTap: () => void) => DragHandlers;
export type RegisterColumn = (date: IsoDate, element: HTMLElement | null) => void;

type Options = {
  readonly range: GridRange;
  readonly disabled: boolean;
  /** Any change (a new view: the dragged entry may be gone) cancels the drag in progress. */
  readonly resetKey: unknown;
  readonly onDrop: (entry: EntryView, date: IsoDate, start: Minutes) => void;
};

type Columns = React.RefObject<Map<IsoDate, HTMLElement>>;

/** The day column under the pointer (by x only: the pointer may leave the grid vertically). */
function columnAt(columns: ReadonlyMap<IsoDate, HTMLElement>, clientX: number): { date: IsoDate; rect: DOMRect } | null {
  for (const [date, element] of columns) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && clientX >= rect.left && clientX <= rect.right) return { date, rect };
  }
  return null;
}

function samePreview(a: DragPreview | null, b: DragPreview | null): boolean {
  if (a === null || b === null) return a === b;
  return a.entry.key === b.entry.key && a.date === b.date && a.start === b.start;
}

/** The ghost's position; re-renders only when it lands on another 15-minute step or day. */
function useDragPreview() {
  const previewRef = useRef<DragPreview | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const updatePreview = useCallback((next: DragPreview | null) => {
    if (samePreview(previewRef.current, next)) return;
    previewRef.current = next;
    setPreview(next);
  }, []);
  return { preview, previewRef, updatePreview };
}

/** Where the dragged card would start under the pointer. */
function previewAt(event: React.PointerEvent<HTMLElement>, current: Session, columns: Columns, last: DragPreview | null, range: GridRange): DragPreview {
  const column = columnAt(columns.current, event.clientX);
  const date = column?.date ?? last?.date ?? current.fromDate;
  const top = column?.rect.top ?? columns.current.get(date)?.getBoundingClientRect().top ?? 0;
  const duration = current.entry.end - current.entry.start;
  return { entry: current.entry, date, start: pointerToStart(event.clientY - top, current.grabOffsetMin, duration, range) };
}

function startSession(event: React.PointerEvent<HTMLElement>, entry: EntryView, date: IsoDate, onTap: () => void): Session {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
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

/** Escape, busy and a new view all cancel the drag in progress. */
function useDragCancellation(cancel: () => void, isDragging: boolean, disabled: boolean, resetKey: unknown) {
  useEffect(() => {
    if (!isDragging) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDragging, cancel]);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  useEffect(() => {
    cancel();
  }, [resetKey, cancel]);
}

/** Press, move and release handlers; options are read from a ref so the handlers keep one identity. */
function useDragHandlers(options: React.RefObject<Options>, columns: Columns, drag: ReturnType<typeof useDragPreview>, cancel: () => void, session: React.RefObject<Session | null>) {
  const { previewRef, updatePreview } = drag;

  const move = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
      if (!current.active && distance < DRAG_THRESHOLD_PX) return;
      if (!current.active) session.current = { ...current, active: true };
      updatePreview(previewAt(event, current, columns, previewRef.current, options.current.range));
    },
    [session, columns, previewRef, updatePreview, options],
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dropped = previewRef.current;
      cancel();
      if (!current.active || !dropped) {
        current.onTap();
        return;
      }
      const unchanged = dropped.date === current.fromDate && dropped.start === current.entry.start;
      if (!unchanged) options.current.onDrop(current.entry, dropped.date, dropped.start);
    },
    [session, previewRef, cancel, options],
  );

  return { move, end };
}

/** Day column bodies by date, so the pointer can be located in them. */
function useColumnRegistry() {
  const columns = useRef(new Map<IsoDate, HTMLElement>());
  /** Called by each day column body's ref callback. */
  const registerColumn = useCallback<RegisterColumn>((date, element) => {
    if (element) columns.current.set(date, element);
    else columns.current.delete(date);
  }, []);
  return { columns, registerColumn };
}

export function usePointerDrag(opts: Options) {
  const options = useRef(opts);
  useEffect(() => {
    options.current = opts;
  });
  const { columns, registerColumn } = useColumnRegistry();
  const session = useRef<Session | null>(null);
  const drag = useDragPreview();
  const { updatePreview } = drag;

  const cancel = useCallback(() => {
    session.current = null;
    updatePreview(null);
  }, [updatePreview]);
  useDragCancellation(cancel, drag.preview !== null, opts.disabled, opts.resetKey);
  const { move, end } = useDragHandlers(options, columns, drag, cancel, session);

  const begin = useCallback((event: React.PointerEvent<HTMLElement>, entry: EntryView, date: IsoDate, onTap: () => void) => {
    if (options.current.disabled || event.button !== 0) return;
    // Stops the menu from opening on press: it opens on tap (pointer up without movement).
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = startSession(event, entry, date, onTap);
  }, []);

  /** Pointer handlers for one movable card. */
  const bind = useCallback<BindDrag>(
    (entry, date, onTap) => ({
      onPointerDown: (event) => begin(event, entry, date, onTap),
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: cancel,
    }),
    [begin, move, end, cancel],
  );

  return { preview: drag.preview, registerColumn, bind };
}
