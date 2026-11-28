// Screenshots of the real app for the marketing site (apps/seller-books-site), not part of the suite:
// `pnpm stills` runs test/stills/*.stills.ts against the same offline e2e server.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./test/stills",
  testMatch: /.*\.stills\.ts$/,
  outputDir: "./test-results/stills",
  retries: 0,
});
