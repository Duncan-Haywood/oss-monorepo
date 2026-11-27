// Resellers keep books from a phone between sourcing runs. At an iPhone's width every page of the shop
// must fit without the page itself scrolling sideways (wide tables scroll inside their own box).
import { devices, expect, test } from "@playwright/test";
import { importReport, signUpWithShop } from "./helpers";

test.use({ viewport: devices["iPhone 13"].viewport, hasTouch: true, isMobile: true });

const PAGES = [
  ["", "Profit & loss"],
  ["/imports", "Imports"],
  ["/sales", "Sales"],
  ["/inventory", "Inventory & cost of goods"],
  ["/stock", "Stock report"],
  ["/mileage", "Mileage log"],
  ["/expenses", null],
  ["/schedule-c", "Schedule C worksheet"],
  ["/estimated-tax", "Quarterly estimated tax"],
  ["/1099k", null],
  ["/members", null],
  ["/billing", "Billing"],
  ["/settings", "Shop settings"],
] as const;

test("every shop page fits a phone's width", async ({ page }) => {
  const { orgPath } = await signUpWithShop(page, { tag: "phone", shop: "Pocket Resale" });
  await importReport(
    page,
    "eBay: Transaction report (Payments > Reports)",
    "ebay-transaction-report.csv",
  );
  await expect(page.getByText(/other charges imported/)).toBeVisible();

  const wide: string[] = [];
  for (const [path, heading] of PAGES) {
    await page.goto(`${orgPath}${path}`);
    if (heading)
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    else await expect(page.locator("main h1").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) wide.push(`${path || "/"} scrolls sideways by ${overflow}px`);
  }
  expect(wide).toEqual([]);
});
