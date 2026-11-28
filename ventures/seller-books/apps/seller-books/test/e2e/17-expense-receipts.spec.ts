// A receipt kept with its expense, in the browser: type an expense in, open its receipts, attach a PDF,
// see it listed and counted on the row, download it byte for byte, have a renamed web page refused with
// the reason, and delete the receipt again.
import { expect, test } from "@playwright/test";
import { nav, signUpWithShop } from "./helpers";

const RECEIPT = Buffer.from("%PDF-1.4\n% Uline order 4217\n%%EOF\n");

test("a reseller keeps a receipt with an expense", async ({ page }) => {
  await signUpWithShop(page, { tag: "receipts", shop: "Shelf Life Resale" });
  await nav(page, "Expenses");
  await page.getByPlaceholder("Amount").fill("42.17");
  await page.getByPlaceholder("Vendor").fill("Uline");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.getByRole("row", { name: /Uline/ });
  await expect(row).toContainText("$42.17");
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("No receipt on this expense yet.")).toBeVisible();

  await page
    .getByLabel(/Add receipt/)
    .setInputFiles({ name: "uline-4217.pdf", mimeType: "application/pdf", buffer: RECEIPT });
  const link = page.getByRole("link", { name: "uline-4217.pdf" });
  await expect(link).toBeVisible();
  await expect(row.getByRole("button", { name: "1 receipt" })).toBeVisible();

  const download = page.waitForEvent("download");
  await link.click();
  const file = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  expect(Buffer.compare(await readFile(file), RECEIPT)).toBe(0);

  await page.getByLabel(/Add receipt/).setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><body>not a receipt</body></html>"),
  });
  await expect(page.getByText(/is named \.pdf but is not one/)).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "uline-4217.pdf" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("No receipt on this expense yet.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Add", exact: true })).toBeVisible();
});
