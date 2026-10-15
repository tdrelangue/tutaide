import { defineConfig } from "vitest/config";

// Engine tests only: run with `npm run test:agenda-engine`.
export default defineConfig({
  test: {
    root: __dirname,
    include: ["test/**/*.test.ts"],
    benchmark: { include: ["test/**/*.bench.ts"] },
    coverage: {
      provider: "v8",
      include: ["domain/**/*.ts", "geo/**/*.ts"],
      exclude: ["**/index.ts", "domain/model.ts", "domain/planTypes.ts"],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
