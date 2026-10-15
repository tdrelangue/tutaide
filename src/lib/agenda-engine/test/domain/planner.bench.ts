import { bench, describe } from "vitest";
import { createContext, propose } from "../../domain";
import { MON } from "./fixtures";
import { benchmarkState } from "./scenario";

describe("planner budget (4 weeks, 60 people, 30 appointments; target < 300 ms)", () => {
  const ctx = createContext(benchmarkState());
  bench("propose", () => {
    propose(ctx, MON, "2026-11-15");
  });
});
