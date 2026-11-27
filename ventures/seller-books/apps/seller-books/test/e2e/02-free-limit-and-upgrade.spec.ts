// The Free plan's one-platform limit and the way out of it, in the browser: an eBay import fits, a
// Poshmark import is refused with the reason, checkout runs (the signed fake provider, nothing charged),
// and once the provider's webhook confirms the subscription the second platform imports. The webhook
// is what Paddle would send; here the spec signs it with the fake's public test secret and the checkout
// token the worker would have handed Paddle (the pending checkout's id, signed with AUTH_SECRET).
import { expect, test } from "@playwright/test";
import { card, confirmCheckout, importReport, nav, signUpWithShop } from "./helpers";

test("the Free plan refuses a second platform until a paid plan is confirmed", async ({
  page,
  baseURL,
}) => {
  const { orgId } = await signUpWithShop(page, { tag: "upgrade", shop: "Two Platform Resale" });

  await importReport(
    page,
    "eBay: Transaction report (Payments > Reports)",
    "ebay-transaction-report.csv",
  );
  await expect(page.getByText(/other charges imported/)).toContainText(
    "3 sales and 2 other charges",
  );

  await importReport(page, "Poshmark: My Sales Report", "poshmark-my-sales-report.csv");
  await expect(
    page.getByText(/The Free plan covers 1 platform and this shop already imports from eBay/),
  ).toBeVisible();
  // Nothing was written for the refused file.
  await expect(card(page, "Past imports").getByRole("row")).toHaveCount(2);

  await nav(page, "Billing");
  await expect(page.getByRole("heading", { name: /^Free · / })).toBeVisible();
  const fulltime = page
    .locator(".card")
    .filter({ has: page.getByRole("button", { name: /Choose Full time/ }) });
  await fulltime.getByRole("button", { name: /Choose Full time/ }).click();
  await page.waitForURL(/checkout=success/);
  expect(new URL(page.url()).searchParams.get("fake_checkout")).toBe("fulltime");
  await expect(
    page.getByText(/Your plan changes here as soon as the payment provider confirms it/),
  ).toBeVisible();
  // Checkout alone changes nothing: only the provider's confirmation does.
  await expect(page.getByRole("heading", { name: /^Free · / })).toBeVisible();

  await confirmCheckout(page, baseURL, orgId, "fulltime");

  await page.reload();
  await expect(page.getByRole("heading", { name: /^Full time · / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage payment and invoices" })).toBeVisible();

  await importReport(page, "Poshmark: My Sales Report", "poshmark-my-sales-report.csv");
  await expect(page.getByText(/other charges imported/)).toBeVisible();
  await expect(card(page, "Past imports").getByRole("row", { name: /Poshmark/ })).toBeVisible();
});
