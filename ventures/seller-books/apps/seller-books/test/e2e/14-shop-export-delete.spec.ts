// Shop settings in the browser: the owner downloads the whole shop as JSON (a direct sale in it), then
// deletes the shop by typing its name, and lands on the shop list with the shop gone.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { nav, signUpWithShop } from "./helpers";

test("the owner downloads every record, then deletes the shop", async ({ page }) => {
  const shop = "Attic Clear-out Co";
  const { orgId } = await signUpWithShop(page, { tag: "shop-delete", shop });
  const res = await page.request.post(`/api/orgs/${orgId}/sales`, {
    data: { date: "2026-04-02", title: "Brass lamp, yard sale", itemCents: 2500 },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(201);

  await nav(page, "Shop settings");
  await expect(page.getByRole("heading", { name: "Shop settings" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download (JSON)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^seller-books-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const data = JSON.parse(await readFile(file, "utf8")) as {
    shop: { name: string };
    counts: { sales: number };
    records: { sales: { title: string }[] };
  };
  expect(data.shop.name).toBe(shop);
  expect(data.counts.sales).toBe(1);
  expect(data.records.sales[0]?.title).toBe("Brass lamp, yard sale");

  const button = page.getByRole("button", { name: "Delete shop" });
  await expect(button).toBeDisabled();
  await page.getByRole("textbox", { name: "Shop name to confirm deletion" }).fill(shop);
  await button.click();

  await page.waitForURL(/\/orgs$/);
  await expect(page.getByText(shop)).toHaveCount(0);
  expect((await page.request.get(`/api/orgs/${orgId}`)).status()).toBe(404);
});
