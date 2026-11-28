// A purchase receipt in the browser: add a lot, see the year's stock counted with no receipt, attach the
// lot's receipt, see every item in it covered and each item row say the lot's receipt covers it.
import { expect, test } from "@playwright/test";
import { nav, signUpWithShop } from "./helpers";

const RECEIPT = Buffer.from("%PDF-1.4\n% Estate sale 30.00\n%%EOF\n");

test("a reseller keeps the receipt for a lot and sees its items covered", async ({ page }) => {
  await signUpWithShop(page, { tag: "purchase-receipts", shop: "Second Look Resale" });
  await nav(page, "Inventory");
  const lotForm = page.locator("form").filter({ hasText: "Add a lot" });
  await lotForm.getByPlaceholder("Lot name").fill("Estate sale haul");
  await lotForm.getByPlaceholder(/Total cost/).fill("30");
  await lotForm.locator("textarea").fill("Pyrex bowl\nWool coat\nLamp");
  await lotForm.getByRole("button", { name: /add lot/i }).click();

  const proof = page.locator("section").filter({ hasText: "Receipts for what you paid" });
  await expect(proof).toContainText("0 of 3");
  await expect(proof).toContainText("$30.00 of cost with no receipt attached");

  const lotRow = page.getByRole("row", { name: /Estate sale haul/ }).first();
  await lotRow.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("No receipt on this lot yet.")).toBeVisible();
  await page
    .getByLabel(/Add receipt/)
    .setInputFiles({ name: "estate-sale.pdf", mimeType: "application/pdf", buffer: RECEIPT });
  await expect(page.getByRole("link", { name: "estate-sale.pdf" })).toBeVisible();
  await expect(lotRow.getByRole("button", { name: "1 receipt" })).toBeVisible();
  await expect(proof).toContainText("3 of 3");
  await expect(proof).toContainText("Every one is covered.");
  await expect(page.getByRole("button", { name: "Lot's receipt" })).toHaveCount(3);
});
