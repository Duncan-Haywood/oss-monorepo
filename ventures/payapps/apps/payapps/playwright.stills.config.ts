// Captures the marketing site's screenshots of the app (test/stills/capture.stills.ts) with the e2e
// server and settings. Run with `pnpm stills`; never part of `pnpm test` or the e2e suite.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./test/stills",
  testMatch: /.*\.stills\.ts$/,
  outputDir: "./test-results/stills",
  retries: 0,
});
