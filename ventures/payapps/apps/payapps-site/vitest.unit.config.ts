// Fast unit tests in Node: plans, page/SEO output, form validation, tokens.
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.ts", "test/unit/**/*.test.ts"],
    environment: "node",
  },
});
