// « N'a pas eu lieu »: an appointment cancelled at the last minute, marked afterwards.
import type {
  Appointment,
  IsoDate,
  PastItem,
  PlannerState,
  ValidatedItem,
} from "./model";
import { addDays, isoDow } from "./time";

export interface DateWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export type MissedResult =
  | {
      readonly ok: true;
      readonly state: PlannerState;
      /** A missed appointment went back to « à placer »; false for a visit or an appointment no longer on file. */
      readonly requeued: boolean;
    }
  | { readonly ok: false; readonly reason: "UNKNOWN_ITEM" | "FUTURE" };

/** Monday to Friday of the week after `today`: the default new window of a missed appointment. */
export function nextWeek(today: IsoDate): DateWindow {
  const monday = addDays(today, 8 - isoDow(today));
  return { from: monday, to: addDays(monday, 4) };
}

function asCancelled(v: ValidatedItem): PastItem {
  return {
    id: v.id,
    apptId: v.apptId,
    held: false,
    kind: v.kind,
    title: v.title,
    participants: v.participants,
    date: v.date,
    start: v.start,
    end: v.end,
  };
}

function reopen(
  state: PlannerState,
  item: { kind: string; apptId: string | null; id: string },
  window: DateWindow,
) {
  const apptId = item.apptId ?? item.id;
  const found =
    item.kind === "APPT" && state.appointments.some((a) => a.id === apptId);
  const appointments: Appointment[] = state.appointments.map((a) =>
    found && a.id === apptId
      ? { ...a, when: { kind: "RANGE" as const, ...window } }
      : a,
  );
  return { appointments, requeued: found };
}

/**
 * Marks a past item (still in the validated plan, or already in history) as
 * « N'a pas eu lieu ». It stays in history as cancelled and no longer counts
 * as seen, so the person's next visit is due again from the last real one
 * (and planned at Normale priority at least). A missed appointment goes back
 * to « à placer » with a new window, by default the following week.
 * A future item cannot be missed: delete or move it instead.
 */
export function markMissed(
  state: PlannerState,
  itemId: string,
  today: IsoDate,
  window: DateWindow = nextWeek(today),
): MissedResult {
  const v = state.validated.find((x) => x.id === itemId);
  if (v) {
    if (v.date > today) return { ok: false, reason: "FUTURE" };
    const { appointments, requeued } = reopen(state, v, window);
    const past = [...state.past, asCancelled(v)];
    return {
      ok: true,
      requeued,
      state: {
        ...state,
        validated: state.validated.filter((x) => x !== v),
        past,
        appointments,
      },
    };
  }
  const p = state.past.find((x) => x.id === itemId && x.held);
  if (!p) return { ok: false, reason: "UNKNOWN_ITEM" };
  const { appointments, requeued } = reopen(state, p, window);
  const past = state.past.map((x) => (x === p ? { ...x, held: false } : x));
  return { ok: true, requeued, state: { ...state, past, appointments } };
}

/**
 * Appointments whose dates have passed although they were never planned nor
 * held: the interface lists them so nothing disappears without a word.
 */
export function staleAppointments(
  state: PlannerState,
  today: IsoDate,
): Appointment[] {
  const done = new Set([
    ...state.validated.map((v) => v.apptId ?? v.id),
    ...state.past.filter((p) => p.held).map((p) => p.apptId ?? p.id),
  ]);
  const end = (a: Appointment) =>
    a.when.kind === "FIXED" ? a.when.date : a.when.to;
  return state.appointments.filter((a) => end(a) < today && !done.has(a.id));
}
