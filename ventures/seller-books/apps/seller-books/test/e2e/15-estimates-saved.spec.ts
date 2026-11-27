// The quarterly estimates page saves the owner's own figures to the shop: typed once, they are there after
// the browser forgets everything it held (another device), and a payment sent lowers "Still to pay".
import { expect, test } from "@playwright/test";
import { labelled, nav, signUpWithShop } from "./helpers";

test("the owner's estimated-tax figures and payments are saved to the shop", async ({ page }) => {
  await signUpWithShop(page, { tag: "estimates", shop: "Flea Market Finds" });
  await nav(page, "Quarterly estimates");
  await labelled(page, "Tax year").fill("2026");
  await expect(page.getByText(/saved to this shop, for its owner and admins only/)).toBeVisible();

  await labelled(page, "Filing status").selectOption("mfj");
  await labelled(page, "W-2 wages this year").fill("40,000");
  await labelled(page, "Last year's total tax").fill("3200");
  const firstPayment = page.getByRole("textbox", { name: /^Estimated payment sent for / }).first();
  await firstPayment.fill("800");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Another device: nothing in this browser's storage, the figures come back from the shop.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await labelled(page, "Tax year").fill("2026");
  await expect(labelled(page, "W-2 wages this year")).toHaveValue("40000");
  await expect(labelled(page, "Last year's total tax")).toHaveValue("3200");
  await expect(labelled(page, "Filing status")).toHaveValue("mfj");
  await expect(firstPayment).toHaveValue("800");
});
