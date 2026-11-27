// A refunded item that came back, in the browser: an item sold and refunded, "Item came back?" on the
// refund row puts it back in stock, the Schedule C worksheet's line 41 counts it and line 36 leaves it out
// of purchases, and undo takes it back out.
import { expect, test } from "@playwright/test";
import { card, labelled, nav, signUpWithShop } from "./helpers";

test("a refunded item that came back goes back in stock and into line 41", async ({ page }) => {
  const { orgId } = await signUpWithShop(page, {
    tag: "refund-restock",
    shop: "Second Look Goods",
  });
  const headers = { Origin: new URL(page.url()).origin };
  const item = await page.request.post(`/api/orgs/${orgId}/inventory/items`, {
    data: { title: "Brass lamp", acquiredDate: "2026-02-01", costCents: 1200 },
    headers,
  });
  expect(item.status()).toBe(201);
  const { id: itemId } = (await item.json()) as { id: string };
  const sold = await page.request.post(`/api/orgs/${orgId}/sales`, {
    data: { date: "2026-03-01", title: "Brass lamp, market", itemCents: 4500, itemId },
    headers,
  });
  expect(sold.status()).toBe(201);
  const refund = await page.request.post(`/api/orgs/${orgId}/sales`, {
    data: { kind: "refund", date: "2026-03-08", title: "Brass lamp returned", refundCents: 4500 },
    headers,
  });
  expect(refund.status()).toBe(201);

  await nav(page, "Sales");
  const row = page.getByRole("row", { name: /Brass lamp returned/ });
  await row.getByRole("button", { name: "Item came back?" }).click();
  await row
    .getByLabel("Item that came back")
    .selectOption({ label: "Brass lamp ($12.00, sold 2026-03-01)" });
  await expect(row).toContainText("Back in stock: Brass lamp ($12.00, 2026-03-08)");

  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");
  const part3 = card(page, "Part III: cost of goods sold (inventory at cost)");
  await expect(part3.getByRole("row", { name: /Inventory at end of year/ })).toContainText(
    "$12.00",
  );
  await expect(part3.getByRole("row", { name: /Purchases less cost/ })).toContainText(
    "Leaves out $12.00 of items that came back on refunds",
  );
  await expect(part3.getByRole("row", { name: /Cost of goods sold/ })).toContainText("$0.00");

  await nav(page, "Sales");
  await row.getByRole("button", { name: "Item came back?" }).click();
  await row.getByRole("button", { name: "Undo return of Brass lamp" }).click();
  await expect(row).not.toContainText("Back in stock");
});
