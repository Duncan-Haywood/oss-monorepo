// Playwright e2e for the demo flow. Runs the real app (Worker + SPA via @cloudflare/vite-plugin) in
// offline demo mode: FAKE_EXTERNALS=true, INLINE_JOBS=true, isolated local state in .wrangler/e2e.
// See scripts/e2e-server.sh (server) and scripts/e2e-run.sh (wrapper).
//
// Env knobs:
//   E2E_PORT=5199             port for the e2e server
//   E2E_BASE_URL=http://...   test an already-running server instead of starting one
//   E2E_REUSE_SERVER=1        reuse a server already listening on E2E_PORT
//   E2E_CHROMIUM_PATH=...     explicit Chromium binary (defaults to Playwright's own lookup)
//   E2E_BASE_PATH=/grants     serve the app under a path prefix, as production does (06-base-path.spec.ts)
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5199);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

// Playwright finds its pinned Chromium via PLAYWRIGHT_BROWSERS_PATH; fall back to the preinstalled one.
const fallbackChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.E2E_CHROMIUM_PATH ??
  (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(fallbackChromium)
    ? fallbackChromium
    : undefined);

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "./test-results/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bash scripts/e2e-server.sh",
        url: `${baseURL}${(process.env.E2E_BASE_PATH ?? "").replace(/\/+$/, "")}/api/health`,
        reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
        timeout: 240_000,
        env: { E2E_PORT: String(port), E2E_BASE_PATH: process.env.E2E_BASE_PATH ?? "" },
        stdout: process.env.E2E_SERVER_LOGS === "1" ? "pipe" : "ignore",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
});
