// Resellers keep books from a phone between sourcing runs. At an iPhone's width every page of the shop
// must fit without the page itself scrolling sideways (wide tables scroll inside their own box).
import { devices, expect, test } from "@playwright/test";
import { card, importReport, nav, signUpWithShop } from "./helpers";

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
  await expect(page.getByText(/other charges? imported/)).toBeVisible();

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

// The stock report's wide tables (lots, sources, days to sell) stack one block per row on a phone
// (.table-stack in styles.css), so they need no sideways scroll inside their own card either.
test("the stock report's tables stack on a phone instead of scrolling", async ({ page }) => {
  const { orgPath } = await signUpWithShop(page, { tag: "phone-stock", shop: "Pocket Stock" });
  await nav(page, "Inventory");
  const lot = card(page, /Add a lot/);
  await lot.getByPlaceholder("Lot name").fill("Estate sale haul");
  await lot.locator('input[type="date"]').fill("2025-12-20");
  await lot.getByPlaceholder("Total cost, e.g. 120.00").fill("30.00");
  await lot.locator("textarea").fill("Blue glass vase\nCandle holders\nBrass bell");
  await lot.getByRole("button", { name: "Add lot" }).click();
  await expect(card(page, "Items").getByRole("row", { name: /Brass bell/ })).toBeVisible();

  await page.goto(`${orgPath}/stock`);
  const lots = card(page, /have they paid for themselves/);
  await expect(lots).toContainText("Estate sale haul");
  // Each figure sits beside its column's name.
  await expect(lots.locator('td[data-label="Sold / items"]')).toContainText("0 / 3");
  const scrolls = await page
    .locator("section.card:has(table.table-stack)")
    .evaluateAll((cards) =>
      cards
        .filter((c) => c.scrollWidth - c.clientWidth > 1)
        .map((c) => `${c.querySelector("h2")?.textContent}: ${c.scrollWidth - c.clientWidth}px`),
    );
  expect(scrolls).toEqual([]);
  expect(await page.locator("table.table-stack").count()).toBeGreaterThanOrEqual(3);
});
