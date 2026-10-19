import path from "node:path";
import { defineConfig } from "vitest/config";

// Agenda module tests (service, bridge DB ↔ engine) on an in-memory PostgreSQL (PGlite).
// Run with `npm run test:agenda`. The engine has its own config (agenda-engine/).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  test: {
    root: __dirname,
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // One PGlite per test file; files run in separate workers.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["*.ts", "bridge/**/*.ts"],
      exclude: ["vitest.config.ts", "context.ts", "geocode.ts"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
