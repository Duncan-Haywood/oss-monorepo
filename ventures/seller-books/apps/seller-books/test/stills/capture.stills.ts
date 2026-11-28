// Screenshots of the real app for the marketing site (apps/seller-books-site). Not a test the suite
// runs: `pnpm stills` runs it against the offline e2e server (playwright.stills.config.ts). PNGs go to
// test/stills/out/ (ignored); the ones the site shows are re-encoded as WebP by the same Chromium (no
// image library) into apps/seller-books-site/assets/shot-*.webp.
//
// The books are exactly the ones test/e2e/01-books-to-schedule-c.spec.ts builds (one Etsy shop, so
// the Free plan; an estate-sale lot, the two Etsy reports, one expense, one trip), and the same figures
// that spec asserts are asserted here before each shot, so a still can never show a number the
// arithmetic doesn't back. Every name is invented and the site's captions say so.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { card, importReport, labelled, nav } from "../e2e/helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const SITE_ASSETS = join(HERE, "..", "..", "..", "seller-books-site", "assets");

/** Re-encodes a PNG from OUT as WebP in the site's assets folder, using the browser's own encoder. */
async function toSite(page: Page, name: string) {
  const png = readFileSync(join(OUT, `${name}.png`)).toString("base64");
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.86);
  }, png);
  if (!dataUrl.startsWith("data:image/webp;base64,"))
    throw new Error("this Chromium cannot encode WebP");
  writeFileSync(
    join(SITE_ASSETS, `shot-${name}.webp`),
    Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
  );
}

/** One card only, as a phone shows it (for the site's <picture> source on narrow screens). */
async function cardShot(page: Page, name: string, scope: ReturnType<typeof card>) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await scope.first().screenshot({
    path: join(OUT, `${name}.png`),
    animations: "disabled",
    caret: "hide",
  });
  await toSite(page, name);
}

/** The viewport (not the full page): the site shows these at a fixed aspect ratio. */
async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // No focused field: a date input left selected would show a highlighted month in the still.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
  await toSite(page, name);
}

const tile = (page: Page, label: string) =>
  page.locator("div.card").filter({ has: page.getByText(label, { exact: true }) });

test("stills of a made-up reseller's books", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  // A fixed address and shop name: the e2e server starts from an empty database.
  await page.goto("/signup");
  await labelled(page, "Your name").fill("Sam Example");
  await labelled(page, "Email").fill("sam@example.com");
  await labelled(page, "Password (10+ characters)").fill("stills-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  const shopName = page.getByPlaceholder("New shop name");
  const agree = page.getByRole("button", { name: "I agree" });
  await expect(shopName.or(agree)).toBeVisible();
  if (await agree.isVisible()) await agree.click();
  await shopName.fill("Example Resale");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/o\/[^/]+$/);
  const orgPath = new URL(page.url()).pathname;

  // The same books as 01-books-to-schedule-c.spec.ts.
  await nav(page, "Inventory");
  const lot = card(page, /Add a lot/);
  await lot.getByPlaceholder("Lot name").fill("Estate sale haul");
  await lot.locator('input[type="date"]').fill("2025-12-20");
  await lot.getByPlaceholder("Total cost, e.g. 120.00").fill("30.00");
  await lot
    .locator("textarea")
    .fill("Blue glass vase | VASE-03\nCandle holders | CANDLE-1\nBrass bell | | 10.00");
  await lot.getByRole("button", { name: "Add lot" }).click();
  await expect(card(page, "Items").getByRole("row", { name: /Brass bell/ })).toContainText(
    "$10.00",
  );
  await importReport(page, "Etsy: Orders file (EtsySoldOrders)", "etsy-sold-orders.csv");
  await expect(page.getByText(/sales? matched to inventory by SKU/)).toContainText(
    "1 sale matched",
  );
  await importReport(page, "Etsy: payment account monthly statement", "etsy-statement.csv");
  await expect(page.getByText(/other charges? imported/)).toBeVisible();

  await nav(page, "Expenses");
  const expense = page.locator("form").filter({ has: page.getByPlaceholder("Vendor") });
  await expense.locator('input[type="date"]').fill("2026-05-05");
  await expense.locator("select").first().selectOption("supplies");
  await expense.getByPlaceholder("Amount").fill("12.99");
  await expense.getByPlaceholder("Vendor").fill("Uline");
  await expense.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Uline" })).toBeVisible();

  await nav(page, "Mileage");
  const trip = page.locator("form").filter({ has: page.getByPlaceholder("Purpose") });
  await trip.locator('input[type="date"]').fill("2026-05-06");
  await trip.getByPlaceholder("Purpose").fill("Estate sale pickup");
  await trip.getByPlaceholder("Miles").fill("12.5");
  await trip.getByRole("checkbox").check();
  await trip.getByRole("button", { name: "Add trip" }).click();
  await expect(
    page.getByRole("heading", { name: /2026: 1 trip, 25\.0 business miles/ }),
  ).toBeVisible();

  // Profit & loss for 2026, the 01 spec's figures.
  await nav(page, "Profit & loss");
  await labelled(page, "From").fill("2026-01-01");
  await labelled(page, "To").fill("2026-12-31");
  await expect(tile(page, "Revenue")).toContainText("$92.70");
  await expect(tile(page, "Fees + postage")).toContainText("$13.72");
  await expect(tile(page, "Cost of goods")).toContainText("$10.00");
  await expect(tile(page, "Net profit")).toContainText("$55.99");
  await expect(card(page, "By platform").getByRole("row", { name: /Etsy/ })).toContainText(
    "$68.98",
  );
  await shot(page, "profit-desktop");

  // Schedule C worksheet, IRS rate for the trip.
  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");
  const line = (scope: ReturnType<typeof card>, n: string) =>
    scope.getByRole("row").filter({ has: page.getByRole("cell", { name: n, exact: true }) });
  const parts12 = card(page, /Parts I and II/);
  await expect(line(parts12, "1")).toContainText("$112.70");
  await expect(line(parts12, "2")).toContainText("$20.00");
  await expect(line(parts12, "4")).toContainText("$10.00");
  await expect(line(parts12, "9")).toContainText("$18.13");
  await shot(page, "schedule-c-desktop");

  // Stock report: the lot's payback.
  await nav(page, "Stock report");
  // Fixed dates (the page defaults to today and the 90 days before it), so the still is reproducible
  // and its tables cover the vase's sale: sales from 2026-01-01, stock as of 2026-06-30.
  await labelled(page, "Sales from").fill("2026-01-01");
  await labelled(page, "Stock as of").fill("2026-06-30");
  const lotRow = card(page, /have they paid for themselves/).getByRole("row", {
    name: /Estate sale haul/,
  });
  await expect(lotRow).toContainText("1 / 3");
  await expect(lotRow).toContainText("$39.23");
  await expect(lotRow).toContainText("131%");
  // One of three sold in the window (the vase, bought 2025-12-20, sold in May 2026).
  await expect(tile(page, "Sell-through")).toContainText("33%");
  await shot(page, "stock-desktop");

  // The P&L on a phone (the viewport: the four totals and the missing-cost flag).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(orgPath);
  await labelled(page, "From").fill("2026-01-01");
  await labelled(page, "To").fill("2026-12-31");
  await expect(tile(page, "Net profit")).toContainText("$55.99");
  await shot(page, "profit-phone");

  // A phone crop of the worksheet's Parts I and II, same figures as above.
  await page.goto(`${orgPath}/schedule-c`);
  await labelled(page, "Tax year").fill("2026");
  const phoneParts = card(page, /Parts I and II/);
  await expect(line(phoneParts, "1")).toContainText("$112.70");
  await expect(line(phoneParts, "9")).toContainText("$18.13");
  // The lines the site's alt text reads out beyond the 01 spec's (fees, supplies, totals).
  await expect(line(phoneParts, "10")).toContainText("$5.62");
  await expect(line(phoneParts, "22")).toContainText("$12.99");
  await expect(line(phoneParts, "28")).toContainText("$44.84");
  await expect(line(phoneParts, "31")).toContainText("$37.86");
  await cardShot(page, "schedule-c-phone", phoneParts);

  // A phone crop of the stock report's lot table, stacked one block per row (.table-stack), same
  // dates and figures as the desktop still.
  await page.goto(`${orgPath}/stock`);
  await labelled(page, "Sales from").fill("2026-01-01");
  await labelled(page, "Stock as of").fill("2026-06-30");
  const phoneLots = card(page, /have they paid for themselves/);
  await expect(phoneLots.locator('td[data-label="Sold / items"]')).toContainText("1 / 3");
  await expect(phoneLots.locator('td[data-label="Proceeds"]')).toContainText("$39.23");
  await expect(phoneLots.locator('td[data-label="Recovered"]')).toContainText("131%");
  await expect(phoneLots.locator('td[data-label="Cost"]')).toContainText("$30.00");
  await cardShot(page, "stock-phone", phoneLots);
});
