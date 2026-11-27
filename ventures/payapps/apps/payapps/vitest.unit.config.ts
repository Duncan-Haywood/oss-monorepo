// Fast unit tests in Node/happy-dom: pure logic (pay-app math, CSV, PDF) and React components.
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/unit/**/*.test.{ts,tsx}"],
    exclude: ["src/worker/**/*.worker.test.ts", "node_modules/**"],
    environment: "node",
    setupFiles: ["./test/unit/setup.ts"],
    css: false,
  },
});
