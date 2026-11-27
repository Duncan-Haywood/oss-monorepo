// A reseller's own sourcing spreadsheet, saved as CSV, on the Inventory page: the preview writes
// nothing and names each skipped line with its reason, the import adds the items and links the Etsy
// order that was already in the books by SKU, and the same sheet again adds nothing. The figures are
// the ones test/worker/inventory-import.test.ts checks on the same fixture.
import { expect, test } from "@playwright/test";
import { card, fixture, importReport, nav, signUpWithShop } from "./helpers";

test("a sourcing sheet previews, imports, links an earlier order by SKU, and does not import twice", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "sheet", shop: "Spreadsheet Resale" });
  // The Etsy order for VASE-03 (sold 2026-05-02) is in the books before its item is.
  await importReport(page, "Etsy: Orders file (EtsySoldOrders)", "etsy-sold-orders.csv");
  await expect(page.getByText(/other charges imported|sales? imported/).first()).toBeVisible();

  await nav(page, "Inventory");
  const sheet = card(page, "Import your sourcing sheet");
  await sheet.locator('input[type="file"]').setInputFiles(fixture("sourcing-sheet.csv"));
  await sheet.getByRole("button", { name: "Preview" }).click();
  // Vase $4.00, three jeans sharing the $10.00 row total, Pyrex $1,015.50, coat $12.00.
  await expect(
    sheet.getByText(/^Would add 6 items costing \$1,041\.50 from \d+ rows\./),
  ).toBeVisible();
  await expect(sheet.getByText(/1 earlier sale would be linked by SKU/)).toBeVisible();
  await expect(sheet.getByText(/Columns read: .*Unit cost ← "Unit Cost"/)).toBeVisible();
  // Five lines are skipped, each with its line number and a reason.
  await expect(sheet.locator("li")).toHaveCount(5);
  await expect(sheet.locator("li").first()).toContainText(/^Line \d+: \S/);
  // Nothing is in the books yet.
  await expect(card(page, "Items").getByRole("row", { name: /Blue glass vase/ })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Import 6 items" }).click();
  await expect(sheet.getByText(/^Added 6 items costing \$1,041\.50/)).toBeVisible();
  const items = card(page, "Items");
  await expect(items.getByRole("row", { name: /Blue glass vase/ })).toBeVisible();
  await expect(items.getByRole("row", { name: /Pyrex bowl/ })).toContainText("$1,015.50");
  await expect(items.getByRole("row", { name: /Levi's 501 jeans/ })).toHaveCount(3);

  // The same file again: everything is already in the books, so there is nothing to import.
  await sheet.locator('input[type="file"]').setInputFiles(fixture("sourcing-sheet.csv"));
  await sheet.getByRole("button", { name: "Preview" }).click();
  await expect(
    sheet.getByText(/^Would add 0 items costing \$0\.00 .* 6 already in your books/),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Import \d+ items$/ })).toHaveCount(0);
});
