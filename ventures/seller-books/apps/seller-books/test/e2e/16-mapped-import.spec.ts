// Another marketplace's file with the columns matched by hand: the suggestions from the header names, a
// fee column marked as a fee, the import, the sales on the Grailed platform, and the saved columns
// offered again for the second file (which then adds nothing). The fixture is written for the test: no
// platform's export layout is assumed (test/fixtures/README or docs/IMPORTERS.md, "Column-mapped").
import { expect, test } from "@playwright/test";
import { card, fixture, nav, signUpWithShop } from "./helpers";

test("a reseller imports a Grailed file by matching its columns", async ({ page }) => {
  await signUpWithShop(page, { tag: "mapped-import", shop: "Archive Menswear" });
  await nav(page, "Imports");
  const box = card(page, "Another platform: match the columns yourself");
  await box.getByLabel("Platform").selectOption("grailed");
  await box.getByLabel("CSV file").setInputFiles(fixture("mapped-any-marketplace.csv"));

  await expect(box.getByText("Header row: line 2, 7 columns.")).toBeVisible();
  await expect(box.getByLabel("Sale date (required)")).toHaveValue("Sold On");
  await expect(
    box.getByLabel("Item price (what the buyer paid for the item) (required)"),
  ).toHaveValue("Sale Price");
  await expect(box.getByLabel("Net payout (what you received)")).toHaveValue("Payout");
  await expect(box.getByLabel("Fee kind for Seller Fee")).toHaveValue("commission");
  await expect(box.getByRole("row", { name: /Wool overcoat/ })).toContainText("-22.50");

  await box.getByRole("button", { name: "Import as Grailed" }).click();
  await expect(box.getByText(/2 sales imported; 0 already imported/)).toBeVisible();

  await page.reload();
  const again = card(page, "Another platform: match the columns yourself");
  await again.getByLabel("Platform").selectOption("grailed");
  await again.getByLabel("CSV file").setInputFiles(fixture("mapped-any-marketplace.csv"));
  await expect(again.getByLabel("Sale date (required)")).toHaveValue("Sold On");
  await again.getByRole("button", { name: "Import as Grailed" }).click();
  await expect(again.getByText(/0 sales imported; 2 already imported/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /mapped-any-marketplace\.csv/ }).first(),
  ).toContainText("Grailed");
});
