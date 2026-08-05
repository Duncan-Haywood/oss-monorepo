import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { briefDialog, isMobileLayout, navToggle, openHomepage, ventureCard } from "./journey";

/**
 * Automated accessibility scanning of the states the critical journey passes
 * through.
 *
 * `docs/QUALITY-ENGINEERING.md` is explicit that this is not a sign-off:
 * "Automated scans are not an accessibility sign-off." A scan finds roughly a
 * third of what a person would, and the manual keyboard and screen-reader
 * verification it also requires is not performed by this file. What is here is
 * the part a machine can hold: the rules that are decidable from the rendered
 * page, in each state, at both widths.
 *
 * Colour contrast is the reason this has to run in a browser. It is resolved
 * from computed styles against actual backgrounds, and no suite in this
 * repository has ever evaluated a colour.
 */

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Only the severities that stop someone completing the task. */
const BLOCKING = new Set(["serious", "critical"]);

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  return results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
}

function describeViolations(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations
    .map(
      (v) =>
        `${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`,
    )
    .join("\n");
}

test.describe("accessibility of the critical journey", () => {
  test("the portfolio as a visitor first meets it", async ({ page }) => {
    await openHomepage(page);
    expect(describeViolations(await scan(page))).toBe("");
  });

  test("the portfolio narrowed to one category", async ({ page }) => {
    await openHomepage(page);
    // Filtering rewrites `aria-pressed` across the control group and hides
    // cards with an inline style. Both are states a scan of the landing page
    // alone never visits.
    await page.locator('.filter-btn[data-filter="ai"]').click();
    expect(describeViolations(await scan(page))).toBe("");
  });

  test("a venture brief while it is open", async ({ page }) => {
    await openHomepage(page);
    const card = ventureCard(page, "print-atelier");
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "Venture brief" }).click();
    await expect(briefDialog(page)).toBeVisible();

    // The dialog injects its body as raw HTML from `specsData`, so this is the
    // one state whose markup is not in index.html and is therefore invisible
    // to every static contract in tests/.
    expect(describeViolations(await scan(page))).toBe("");
  });

  test("the disclosure menu while it covers the page", async ({ page }) => {
    await openHomepage(page);
    if (!isMobileLayout(page)) {
      // The panel is the header at this width and is already covered above.
      await expect(navToggle(page)).toBeHidden();
      return;
    }
    await navToggle(page).click();
    expect(describeViolations(await scan(page))).toBe("");
  });
});
