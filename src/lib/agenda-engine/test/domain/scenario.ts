// Deterministic "busy MJPM" data set for the performance budget:
// 60 protected persons around Brive and Tulle, 30 appointments, the demo's rules.
import type {
  Appointment,
  Contact,
  Period,
  PlannerState,
  Priority,
  SlotRule,
} from "../../domain";
import { H, WEEKDAYS, appt, contact, place, protege, state } from "./fixtures";

/** Small linear congruential generator: same numbers on every run. */
function generator(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    return x / 2_147_483_648;
  };
}

const PERIODS: readonly Period[] = [
  "MONTH",
  "MONTH",
  "QUARTER",
  "QUARTER",
  "QUARTER",
  "YEAR",
  "WEEK",
];
const PRIORITIES: readonly Priority[] = ["LOW", "LOW", "LOW", "NORMAL", "HIGH"];

function pick<T>(rand: () => number, list: readonly T[]): T {
  const value = list[Math.floor(rand() * list.length)];
  if (value === undefined) throw new Error("empty list");
  return value;
}

function people(rand: () => number): Contact[] {
  return Array.from({ length: 60 }, (_, i) => {
    const last = new Date(
      Date.UTC(2026, 9, 14) - Math.floor(rand() * 100) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    return protege(`p${i}`, `Personne ${i}`, {
      at: place(`h${i}`, 45.0 + rand() * 0.55, 1.3 + rand() * 1.0),
      last,
      period: pick(rand, PERIODS),
      priority: pick(rand, PRIORITIES),
      ...(i % 7 === 0 ? { notBefore: H(10) } : {}),
    });
  });
}

function appointments(rand: () => number): Appointment[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = 19 + Math.floor(rand() * 26);
    const date = new Date(Date.UTC(2026, 9, day)).toISOString().slice(0, 10);
    const until = new Date(Date.UTC(2026, 9, day + 4))
      .toISOString()
      .slice(0, 10);
    const who = [`p${Math.floor(rand() * 60)}`];
    if (i % 3 === 0)
      return appt(
        `a${i}`,
        { kind: "FIXED", date, time: H(9 + Math.floor(rand() * 8)) },
        { participants: who, placeId: `p${who[0]?.slice(1) ?? "0"}-home` },
      );
    return appt(
      `a${i}`,
      { kind: "RANGE", from: date, to: until },
      {
        participants: i % 5 === 0 ? [...who, "bank"] : who,
        placeId: i % 5 === 0 ? "bank" : "office",
        priority: pick(rand, PRIORITIES),
      },
    );
  });
}

const RULES: readonly SlotRule[] = [
  {
    id: "bureau",
    type: "UNAVAILABLE",
    label: "Bureau",
    dow: 2,
    allDay: false,
    from: H(9),
    to: H(12, 30),
    atOffice: true,
    strength: "HARD",
  },
  {
    id: "lundi",
    type: "UNAVAILABLE",
    label: "À la maison",
    dow: 1,
    allDay: true,
    strength: "STRONG",
  },
  {
    id: "vendredi",
    type: "MAX_VISITS",
    label: "Vendredi léger",
    dow: 5,
    max: 2,
    strength: "MEDIUM",
  },
  {
    id: "jeudi",
    type: "MAX_VISITS",
    label: "Jeudi",
    dow: 4,
    max: 5,
    strength: "STRONG",
  },
];

export function benchmarkState(): PlannerState {
  const rand = generator(20_261_014);
  const bank = contact(
    "bank",
    "Agence bancaire",
    "PRO",
    [place("bank", 45.1595, 1.535)],
    [
      { dows: WEEKDAYS, from: H(9), to: H(12) },
      { dows: WEEKDAYS, from: H(14), to: H(17) },
    ],
  );
  return state({
    contacts: [...people(rand), bank],
    appointments: appointments(rand),
    rules: RULES,
  });
}
