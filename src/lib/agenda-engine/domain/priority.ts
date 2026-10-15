import type { Priority } from "./model";

export const PRIO_RANK: Readonly<Record<Priority, number>> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  MUST: 4,
};

/** Cost of leaving an item unplaced, used to compare plans. */
export const PRIO_COST: Readonly<Record<Priority, number>> = {
  LOW: 20,
  NORMAL: 60,
  HIGH: 120,
  MUST: 400,
};
