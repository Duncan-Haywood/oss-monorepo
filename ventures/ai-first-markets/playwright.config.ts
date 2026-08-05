import { defineConfig, devices } from "@playwright/test";

/**
 * The critical-journey suite required by `docs/QUALITY-ENGINEERING.md` for AI-First Markets.
 *
 * Two ways to run it:
 *   npm run test:e2e                    against a production build started locally
 *   PLAYWRIGHT_BASE_URL=https://…       against the immutable release candidate
 */

const DEFAULT_PORT = 3110;
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/+$/, "");
const startsItsOwnServer = !externalBaseUrl;

if (startsItsOwnServer) {
  process.env.ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || "test@example.com";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || "dev-only-secret-change-in-production";
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",

  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  forbidOnly: !!process.env.CI,

  retries: 0,

  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "e2e-report" }], ["github"]]
    : [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],

  use: {
    baseURL: externalBaseUrl ?? DEFAULT_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    contextOptions: {
      reducedMotion: "reduce",
    },
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: startsItsOwnServer
    ? {
        command: `npx next start --hostname 127.0.0.1 --port ${DEFAULT_PORT}`,
        url: DEFAULT_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          PORT: String(DEFAULT_PORT),
          ALLOWED_EMAIL: process.env.ALLOWED_EMAIL || "test@example.com",
          AUTH_SECRET: process.env.AUTH_SECRET || "dev-only-secret-change-in-production",
          NODE_ENV: "production",
        },
      }
    : undefined,
});
