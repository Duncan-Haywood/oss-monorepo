// A sized field (`className="input w-24"`) renders at the width its utility asks for. `.input` and
// the other component classes in styles.css sit in `@layer components`, below Tailwind's utilities;
// unlayered, `.input`'s w-full beat every w-* utility, so short money fields stretched across the
// card on a laptop and dropped under their label in a stacked table row on a phone.
import { devices, expect, type Page, test } from "@playwright/test";
import { importReport, signUpWithShop } from "./helpers";

const PAGES = ["/estimated-tax", "/1099k", "/stock", "/mileage"] as const;

async function sizedFields(page: Page) {
  return page.locator("main .input").evaluateAll((els) =>
    els.flatMap((el) => {
      const m = /(?:^|\s)w-(\d+)(?:\s|$)/.exec(el.className);
      if (!m || el.getClientRects().length === 0) return [];
      const want = Number(m[1]) * 4; // Tailwind's spacing step is 0.25rem = 4px
      const got = Math.round(el.getBoundingClientRect().width);
      const name = el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.id;
      return Math.abs(got - want) > 1 ? [`${name}: ${got}px, class asks ${want}px`] : [];
    }),
  );
}

async function checkPages(page: Page, orgPath: string) {
  const wrong: string[] = [];
  let seen = 0;
  for (const path of PAGES) {
    await page.goto(`${orgPath}${path}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    seen += await page
      .locator("main .input")
      .evaluateAll((els) => els.filter((el) => /(?:^|\s)w-\d+(?:\s|$)/.test(el.className)).length);
    for (const w of await sizedFields(page)) wrong.push(`${path}: ${w}`);
  }
  expect(seen).toBeGreaterThan(5);
  expect(wrong).toEqual([]);
}

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("sized fields keep their width", async ({ page }) => {
    const { orgPath } = await signUpWithShop(page, { tag: "widths", shop: "Width Resale" });
    await checkPages(page, orgPath);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: devices["iPhone 13"].viewport, hasTouch: true, isMobile: true });
  test("sized fields keep their width, and a stacked row's field sits beside its label", async ({
    page,
  }) => {
    const { orgPath } = await signUpWithShop(page, { tag: "widths-phone", shop: "Width Pocket" });
    await importReport(
      page,
      "eBay: Transaction report (Payments > Reports)",
      "ebay-transaction-report.csv",
    );
    await expect(page.getByText(/other charges? imported/)).toBeVisible();
    await checkPages(page, orgPath);
    await page.goto(`${orgPath}/estimated-tax`);
    await page.waitForLoadState("networkidle");
    const cell = page.locator('td[data-label="Paid toward it"]').first();
    const field = cell.locator("input");
    await expect(field).toBeVisible();
    // One line: the cell is no taller than its field plus the cell's padding.
    const [c, f] = [await cell.boundingBox(), await field.boundingBox()];
    expect(c && f && c.height - f.height).toBeLessThanOrEqual(8);
  });
});
