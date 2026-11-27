// A sale made off the marketplaces, in the browser: add a stock item, type in a Facebook Marketplace
// sale with a payment fee against it, see it on the Sales page, then delete it.
import { expect, test } from "@playwright/test";
import { card, labelled, nav, signUpWithShop } from "./helpers";

test("a reseller types in a direct sale and it reaches the books", async ({ page }) => {
  const { orgId } = await signUpWithShop(page, { tag: "direct-sale", shop: "Porch Pickup Finds" });
  const res = await page.request.post(`/api/orgs/${orgId}/inventory/items`, {
    data: { title: "Oak side table", acquiredDate: "2026-02-01", costCents: 1500 },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(201);

  await nav(page, "Sales");
  await page.getByRole("button", { name: "Add a direct sale" }).click();
  const form = card(page, "Add a direct sale");
  await labelled(form, "Date").fill("2026-03-14");
  await labelled(form, "What sold").fill("Oak side table, Facebook Marketplace");
  await labelled(form, "Buyer paid for the item").fill("60.00");
  await labelled(form, "Payment app fee").fill("1.74");
  await labelled(form, "Stock item sold (sets cost of goods)").selectOption({
    label: "Oak side table ($15.00)",
  });
  await form.getByRole("button", { name: "Save" }).click();

  const row = page.getByRole("row", { name: /Oak side table, Facebook Marketplace/ });
  await expect(row).toContainText("Direct sales");
  await expect(row).toContainText("$60.00");
  await expect(row).toContainText("Payment processing: $1.74");
  await expect(row).toContainText("$58.26");
  await expect(row).toContainText("Linked");

  await row.getByRole("button", { name: /Delete direct sale/ }).click();
  await expect(row).toHaveCount(0);
});
