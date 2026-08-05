import { defineConfig, devices } from "@playwright/test";

/**
 * The critical-journey suite `docs/QUALITY-ENGINEERING.md` requires of a
 * production UI, for the one venture in this portfolio with live customers.
 *
 * Two ways to run it, and the difference is the point:
 *
 *   npm run test:e2e                    against the working tree, served locally
 *   PLAYWRIGHT_BASE_URL=https://…       against the immutable release candidate
 *
 * The same specs serve both because the roadmap asks for the journeys to run on
 * the pull request *and* on the exact artifact that will be promoted. Nothing
 * under `e2e/` imports site code or re-declares its content — the specs read
 * the page — so pointing this at a deployed URL tests what is actually serving
 * traffic rather than a local re-implementation of it.
 *
 * This does not replace `tests/`. That suite executes app.js in a `node:vm`
 * against a fixture derived from index.html, and it is faster and more precise
 * about markup contracts than a browser can be. What it structurally cannot see
 * is everything below: real layout, real focus, real event dispatch through the
 * twelve inline `onclick` attributes, media queries, and colour.
 */

const DEFAULT_PORT = 4173;
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/+$/, "");
const startsItsOwnServer = !externalBaseUrl;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",

  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  forbidOnly: !!process.env.CI,

  /**
   * Zero, deliberately, and it matches the pairwise suite for the same reason.
   * `docs/QUALITY-ENGINEERING.md`: "Retries may diagnose a flake but the
   * original failure remains a failed signal." Playwright's `retries` does the
   * opposite — a test that passes on attempt two is reported as flaky and the
   * run exits 0, so the gate goes green on a failure no one is shown.
   */
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

    /**
     * `style.css` turns off smooth scrolling and collapses every transition
     * under `prefers-reduced-motion: reduce`. Asserting scroll position or a
     * post-click state without it races the animation, and the repository's
     * rule is no arbitrary sleeps — so the suite takes the deterministic branch
     * the stylesheet already provides. The motion path is not thereby covered;
     * it is a documented gap, not a silent one.
     */
    reducedMotion: "reduce",
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
        command: `node e2e/static-server.mjs`,
        url: DEFAULT_BASE_URL,
        env: { PORT: String(DEFAULT_PORT) },
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
