import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { startAnonymousSession } from "./journey";

/**
 * Automated accessibility scans on the screens the critical journey passes
 * through, at both viewports the suite runs.
 *
 * An automated scan finds roughly a third of what a person would. It is here
 * because that third regresses silently and a person does not re-check every
 * pull request — not because passing it means the product is accessible.
 * `docs/QUALITY-ENGINEERING.md` asks for manual checks alongside this, and
 * they are still owed.
 */

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Only the two severities that block someone from completing the task. */
const BLOCKING = new Set(["serious", "critical"]);

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  return results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
}

function describeViolations(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations
    .map((v) => `${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`)
    .join("\n");
}

test.describe("accessibility of the critical journey", () => {
  test("landing page has no blocking violations", async ({ page }) => {
    await page.goto("/");
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("the card screen has no blocking violations", async ({ page }) => {
    await startAnonymousSession(page, "Robin");
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("the card screen announces progress to a screen reader", async ({ page }) => {
    await startAnonymousSession(page, "Robin");

    const progress = page.getByRole("progressbar");
    await expect(progress).toHaveAttribute("aria-label", /Progress through level \d+/);
    await expect(progress).toHaveAttribute("aria-valuenow", /^\d+$/);
  });
});
