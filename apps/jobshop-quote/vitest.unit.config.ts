// Fast unit tests in Node: pure logic (costing engine, extraction checks, PDF writer, matching).
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.ts", "test/unit/**/*.test.ts"],
    exclude: ["src/worker/**/*.worker.test.ts", "node_modules/**"],
    environment: "node",
  },
});
