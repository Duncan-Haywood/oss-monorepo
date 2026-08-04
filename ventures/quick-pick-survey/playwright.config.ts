import { defineConfig, devices } from "@playwright/test";

/**
 * The critical-journey suite required by `docs/QUALITY-ENGINEERING.md`.
 *
 * Two ways to run it, and the difference matters:
 *
 *   npm run test:e2e                    against a production build started here
 *   PLAYWRIGHT_BASE_URL=https://…       against the immutable candidate
 *
 * The same specs serve both because the roadmap asks for the journeys to run
 * on the pull request *and* on the exact release candidate. Nothing in `e2e/`
 * imports application code, so pointing this at a deployed URL tests what is
 * actually serving traffic rather than a local re-implementation of it.
 */

const DEFAULT_PORT = 3100;
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/+$/, "");
const startsItsOwnServer = !externalBaseUrl;

/**
 * Fail closed rather than start a server that answers 500 to the first vote.
 *
 * `next start` runs with NODE_ENV=production, where `src/lib/http.ts` throws
 * if no rate-limit secret is set and Prisma throws if the datasource URL is
 * absent. Without this check the suite still "runs" — it just fails every
 * journey with a stack trace that looks like a product defect instead of a
 * missing environment. A suite that cannot tell those two apart is not
 * evidence of anything.
 */
if (startsItsOwnServer) {
  const required = ["POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"];
  const missing = required.filter((name) => !process.env[name]);
  if (!process.env.RATE_LIMIT_SECRET && !process.env.ADMIN_SESSION_SECRET) {
    missing.push("RATE_LIMIT_SECRET");
  }
  if (missing.length > 0) {
    throw new Error(
      [
        `The journey suite needs a seeded database and cannot start one for you: ${missing.join(", ")} is not set.`,
        "",
        "  bash scripts/test-db.sh start",
        "  eval \"$(bash scripts/test-db.sh env)\"",
        "  export RATE_LIMIT_SECRET=local-journey-secret",
        "  npm run build && npm run test:e2e",
        "",
        "Or point the suite at an already-running deployment with PLAYWRIGHT_BASE_URL.",
      ].join("\n"),
    );
  }
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",

  /* Each spec drives its own anonymous session, so files are independent. */
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* `test.only` left in a spec silently shrinks the gate to one journey. */
  forbidOnly: !!process.env.CI,

  /**
   * No retries, deliberately.
   *
   * `docs/QUALITY-ENGINEERING.md`: "Retries may diagnose a flake but the
   * original failure remains a failed signal." Playwright's `retries` does the
   * opposite — a test that passes on attempt two is reported as flaky and the
   * run exits 0, so the gate goes green on a failure a human never sees. If a
   * journey here is flaky, that is a defect in the journey or the product, and
   * the trace attached below is how to find out which.
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
    /* Locators wait; nothing in `e2e/` may sleep. */
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      /* The product is phone-first — `BottomNav` and the card stack only take
         their real shape below the `sm` breakpoint, so a desktop-only run
         would not have exercised the layout most visitors get. */
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: startsItsOwnServer
    ? {
        command: `npm run start -- --hostname 127.0.0.1 --port ${DEFAULT_PORT}`,
        url: `${DEFAULT_BASE_URL}/api/health/ready`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
