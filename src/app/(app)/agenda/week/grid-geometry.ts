import type { Minutes } from "@/lib/agenda/views/types";

/**
 * Pure geometry of the week grid: minutes <-> pixels, 15-minute snap and
 * overlap lanes. No DOM, no React: unit-testable as is.
 */

export const PX_PER_MIN = 1.2;
export const SNAP_MIN = 15;
/** Smallest card height: keeps every card a ≥ 24 px touch target (WCAG 2.5.8). */
export const MIN_CARD_PX = 24;

export type GridRange = { readonly from: Minutes; readonly to: Minutes };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function minutesToPx(minutes: Minutes, range: GridRange): number {
  return (minutes - range.from) * PX_PER_MIN;
}

export function gridHeight(range: GridRange): number {
  return (range.to - range.from) * PX_PER_MIN;
}

export function snap(minutes: Minutes): Minutes {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN;
}

/** Top and height of a block, clipped to the visible hours. */
export function cardBox(start: Minutes, end: Minutes, range: GridRange): { readonly top: number; readonly height: number } {
  const from = clamp(start, range.from, range.to);
  const to = clamp(end, range.from, range.to);
  const top = minutesToPx(from, range);
  const height = Math.max(MIN_CARD_PX, (to - from) * PX_PER_MIN - 2);
  return { top: Math.min(top, gridHeight(range) - MIN_CARD_PX), height };
}

/**
 * Start time under the pointer: `offsetPx` from the top of the day column,
 * minus where the card was grabbed, snapped to 15 min, kept inside the grid.
 */
export function pointerToStart(offsetPx: number, grabOffsetMin: number, duration: Minutes, range: GridRange): Minutes {
  const raw = range.from + offsetPx / PX_PER_MIN - grabOffsetMin;
  return clamp(snap(raw), range.from, Math.max(range.from, range.to - duration));
}

/** Full hours inside the range: 480, 540… */
export function hourMarks(range: GridRange): readonly Minutes[] {
  const marks: Minutes[] = [];
  for (let m = Math.ceil(range.from / 60) * 60; m <= range.to; m += 60) marks.push(m);
  return marks;
}

export type Laned<T> = { readonly item: T; readonly lane: number; readonly lanes: number };

type Timed = { readonly start: Minutes; readonly end: Minutes };

/** Lane of `item` among lanes ending at `laneEnds` (first free one, or a new one). */
function pickLane(laneEnds: readonly Minutes[], item: Timed): number {
  const free = laneEnds.findIndex((end) => end <= item.start);
  return free === -1 ? laneEnds.length : free;
}

/**
 * Side-by-side lanes for overlapping blocks. Blocks that overlap (directly or
 * through a chain) form a cluster; every block of a cluster shares its lane
 * count, so widths line up.
 */
export function layoutLanes<T extends Timed>(items: readonly T[]): readonly Laned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Laned<T>[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let laneEnds: Minutes[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    const lanes = laneEnds.length;
    cluster.forEach((c) => result.push({ item: c.item, lane: c.lane, lanes }));
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length > 0) {
      flush();
      cluster = [];
      laneEnds = [];
    }
    const lane = pickLane(laneEnds, item);
    laneEnds = lane === laneEnds.length ? [...laneEnds, item.end] : laneEnds.map((end, i) => (i === lane ? item.end : end));
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
