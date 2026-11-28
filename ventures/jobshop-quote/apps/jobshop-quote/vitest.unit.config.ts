// Fast unit tests in Node: pure logic (costing engine, extraction checks, PDF writer, matching).
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.ts", "test/unit/**/*.test.ts"],
    exclude: ["src/worker/**/*.worker.test.ts", "node_modules/**"],
    environment: "node",
    // Reuse each Vitest worker across test files instead of spawning one per file (46 files).
    // Cold suite 6.1 s -> 1.9 s on 4 cores, same 695 tests
    // (docs/history/payapps-unit-tests-perf-2026-11-28.md). What this asks of a test file: undo
    // what it changes globally (vi.unstubAllGlobals after vi.stubGlobal) and pass in any order:
    // `--sequence.shuffle.files` must pass too.
    isolate: false,
  },
});
