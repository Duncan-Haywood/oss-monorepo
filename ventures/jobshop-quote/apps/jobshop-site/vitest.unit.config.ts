import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: { include: ["test/unit/**/*.test.ts"], environment: "node" },
});
