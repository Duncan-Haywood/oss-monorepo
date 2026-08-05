import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setAuthenticatedSession } from "./helpers";

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["serious", "critical"]);

async function scanPage(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  return results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
}

function describeViolations(violations: Awaited<ReturnType<typeof scanPage>>): string {
  return violations
    .map(
      (v) =>
        `${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`,
    )
    .join("\n");
}

test.describe("Accessibility and Responsive Layout", () => {
  test("public landing page passes automated accessibility audit", async ({ page }) => {
    await page.goto("/");
    const violations = await scanPage(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("subscribe page passes automated accessibility audit", async ({ page }) => {
    await page.goto("/subscribe");
    const violations = await scanPage(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("protected market map passes accessibility audit when authenticated", async ({
    page,
    context,
    baseURL,
  }) => {
    await setAuthenticatedSession(context, "test@example.com", baseURL);
    await page.goto("/market-map");
    const violations = await scanPage(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("keyboard navigation allows tabbing through interactive elements", async ({ page }) => {
    await page.goto("/subscribe");

    // Focus initial element or tab into the form
    await page.keyboard.press("Tab");

    // Press Tab multiple times and verify an active element is focused
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    const isAnyElementFocused = await page.evaluate(() => {
      return document.activeElement !== null && document.activeElement !== document.body;
    });
    expect(isAnyElementFocused).toBe(true);
  });
});
