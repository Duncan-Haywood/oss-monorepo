// Sign-up to a Schedule C worksheet, in the browser: a bulk lot with its cost spread over items, the
// two Etsy reports (orders, then the monthly statement with fees and postage), one expense and one
// round trip, then the P&L and the worksheet. The numbers are the ones test/worker/books.test.ts
// checks through the API ("links sales to lot items by SKU..."), so the pages are held to the same
// arithmetic the worker is.
import { expect, test } from "@playwright/test";
import { card, importReport, labelled, nav, signUpWithShop } from "./helpers";

test("a reseller goes from sign-up to a Schedule C worksheet", async ({ page }) => {
  await signUpWithShop(page, { tag: "books", shop: "Thrift Flip Co" });
  await expect(page.getByRole("heading", { name: "Profit & loss" })).toBeVisible();
  // A new shop sees the first-run checklist (src/shared/getting-started.ts), every step a link.
  const checklist = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Getting started: 0 of 4 done/ }),
  });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByRole("link", { name: "Import a marketplace report" })).toBeVisible();

  // An estate-sale lot: $30 over three items, one with its own $10 cost, so the other two get $10 each.
  await nav(page, "Inventory");
  const lot = card(page, /Add a lot/);
  await lot.getByPlaceholder("Lot name").fill("Estate sale haul");
  await lot.locator('input[type="date"]').fill("2025-12-20");
  await lot.getByPlaceholder("Total cost, e.g. 120.00").fill("30.00");
  await lot
    .locator("textarea")
    .fill("Blue glass vase | VASE-03\nCandle holders | CANDLE-1\nBrass bell | | 10.00");
  await lot.getByRole("button", { name: "Add lot" }).click();
  const items = card(page, "Items");
  await expect(items.getByRole("row", { name: /Blue glass vase/ })).toContainText("$10.00");
  await expect(items.getByRole("row", { name: /Candle holders/ })).toContainText("$10.00");
  await expect(items.getByRole("row", { name: /Brass bell/ })).toContainText("$10.00");

  // Orders first: the vase's SKU links one sale to the lot item.
  await importReport(page, "Etsy: Orders file (EtsySoldOrders)", "etsy-sold-orders.csv");
  await expect(page.getByText(/sales matched to inventory by SKU/)).toContainText(
    "1 sales matched",
  );
  await importReport(page, "Etsy: payment account monthly statement", "etsy-statement.csv");
  await expect(page.getByText(/other charges imported/)).toBeVisible();
  const past = card(page, "Past imports");
  await expect(past.getByRole("row", { name: /etsy-sold-orders\.csv/ })).toBeVisible();
  await expect(past.getByRole("row", { name: /etsy-statement\.csv/ })).toBeVisible();

  // The same file again is skipped row by row, not doubled.
  await importReport(page, "Etsy: Orders file (EtsySoldOrders)", "etsy-sold-orders.csv");
  await expect(page.getByText(/other charges imported/)).toContainText("0 sales and");

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
    page.getByRole("heading", { name: /2026: 1 trips, 25\.0 business miles/ }),
  ).toBeVisible();

  // P&L for 2026. Revenue (3420 + 650) + (6400 + 800) − 2000 refund = $92.70; fees $8.62; postage
  // $5.10; COGS $10.00 (the vase; the second order has no SKU and is flagged); expenses $12.99.
  await nav(page, "Profit & loss");
  // Every step is now in the books (a report, a lot, a linked sale, an expense), so it is gone.
  await expect(page.getByRole("heading", { name: /Getting started/ })).toHaveCount(0);
  await labelled(page, "From").fill("2026-01-01");
  await labelled(page, "To").fill("2026-12-31");
  const tile = (label: string) =>
    page.locator("div.card").filter({ has: page.getByText(label, { exact: true }) });
  await expect(tile("Revenue")).toContainText("$92.70");
  await expect(tile("Fees + postage")).toContainText("$13.72");
  await expect(tile("Cost of goods")).toContainText("$10.00");
  await expect(tile("Net profit")).toContainText("$55.99");
  await expect(page.getByText(/orders have no inventory item linked/)).toContainText("1 orders");
  // The expense was logged for all platforms, so Etsy's own row nets $92.70 − 8.62 − 5.10 − 10.00.
  await expect(card(page, "By platform").getByRole("row", { name: /Etsy/ })).toContainText(
    "$68.98",
  );
  // The sales ledger behind those tiles: one row per sale, refund and charge, gross profit $68.98.
  const [ledgerFile] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download sales ledger (CSV)" }).click(),
  ]);
  expect(ledgerFile.suggestedFilename()).toBe("sales-ledger-2026-01-01-to-2026-12-31.csv");
  const ledgerCsv = await ledgerFile.createReadStream().then(async (s) => {
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  });
  expect(ledgerCsv).toMatch(/^Total,,\d+ rows,,,,,.*,92\.70,8\.62,5\.10,10\.00,68\.98,/m);

  // Worksheet: line 1 gross receipts $112.70, line 2 returns $20.00, line 4 COGS $10.00; line 9 car
  // expenses first at the IRS rate on the trip's date (25 miles × 72.5¢ in May 2026 = $18.13), then at a
  // typed-in 70¢ for every trip ($17.50); Part III line 35 inventory bought $30.
  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");
  const line = (scope: ReturnType<typeof card>, n: string) =>
    scope.getByRole("row").filter({ has: page.getByRole("cell", { name: n, exact: true }) });
  const parts12 = card(page, /Parts I and II/);
  await expect(line(parts12, "9")).toContainText("$18.13");
  await expect(line(parts12, "9")).toContainText("IR-2025-128");
  await labelled(page, "One rate for every trip (¢/mile, optional)").fill("70");
  await expect(line(parts12, "1")).toContainText("$112.70");
  await expect(line(parts12, "2")).toContainText("$20.00");
  await expect(line(parts12, "4")).toContainText("$10.00");
  await expect(line(parts12, "9")).toContainText("$17.50");
  await expect(line(card(page, /Part III/), "35")).toContainText("$30.00");
  await expect(page.getByText("Line 44a business miles: 25.0")).toBeVisible();

  // The CSV the preparer gets carries the same disclaimer the worker test checks.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  const csv = await download.createReadStream().then(async (s) => {
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  });
  expect(csv).toMatch(/not a tax return and not tax advice/);
  expect(csv).toContain("112.70");

  // Quarterly estimates read the same books. A profit this small leaves federal tax under $1,000, so no
  // estimated payments are due; last year's tax is shown with the 110% rule once its box is ticked.
  await nav(page, "Quarterly estimates");
  await expect(page.getByRole("heading", { name: "Quarterly estimated tax" })).toBeVisible();
  await labelled(page, "Tax year").fill("2026");
  await labelled(page, "Last year's total tax").fill("1200");
  await expect(page.getByText(/no estimated payments are required/)).toBeVisible();
  const dueRows = card(page, "By due date").getByRole("row");
  await expect(dueRows.filter({ hasText: "2026-04-15" })).toContainText("Period over");
  await expect(dueRows.filter({ hasText: "2027-01-15" })).toBeVisible();

  // The stock report: the lot's two unsold items and its payback from the vase's Etsy order
  // ($34.20 + $6.50 shipping = $40.70 against $30.00, 136%), the figures test/worker/books.test.ts
  // ("stock report") checks through the API.
  await nav(page, "Stock report");
  await expect(page.getByRole("heading", { name: "Stock report" })).toBeVisible();
  const lotRow = card(page, /have they paid for themselves/).getByRole("row", {
    name: /Estate sale haul/,
  });
  await expect(lotRow).toContainText("1 / 3");
  await expect(lotRow).toContainText("$40.70");
  await expect(lotRow).toContainText("136%");
  await expect(lotRow).toContainText("$20.00");
});
