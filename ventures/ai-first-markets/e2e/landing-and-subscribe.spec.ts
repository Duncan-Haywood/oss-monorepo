import { test, expect } from "@playwright/test";

test.describe("Landing & Public Subscription Journeys", () => {
  test("loads the dashboard with headline and portfolio summary cards", async ({ page }) => {
    await page.goto("/");

    // Verify main page heading
    await expect(
      page.getByRole("heading", { name: "Find the right markets, then choose the right business" }),
    ).toBeVisible();

    // Verify portfolio stat cards exist with exact text matching
    await expect(page.getByText("Ideas Evaluated", { exact: true })).toBeVisible();
    await expect(page.getByText("Strong $100k Fits", { exact: true })).toBeVisible();
    await expect(page.getByText("Strong $1M Fits", { exact: true })).toBeVisible();
    await expect(page.getByText("Operating Model", { exact: true })).toBeVisible();

    // Verify advertised links are navigable or present
    await expect(page.getByRole("link", { name: /Explore the AI-first market map/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Full report/i }).first()).toBeVisible();
  });

  test("handles newsletter subscription on the free tier", async ({ page }) => {
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message:
            "You're on the list for Weekly Market Intelligence. The next issue goes out to subscriber@example.com.",
        }),
      });
    });

    await page.goto("/subscribe");

    await expect(
      page.getByRole("heading", { name: "Subscribe to AI-First Market Intelligence" }),
    ).toBeVisible();

    // Select Free Weekly tier button first
    const freeTierBtn = page.getByRole("button", { name: /Free Weekly/i });
    await freeTierBtn.click();

    // Fill in email
    const emailInput = page.getByPlaceholder("founder@company.com");
    await emailInput.fill("subscriber@example.com");

    // Click free tier submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toHaveText("Subscribe Free");
    await submitButton.click();

    // Assert status message
    const statusMsg = page.getByRole("status");
    await expect(statusMsg).toBeVisible();
    await expect(statusMsg).toContainText("subscriber@example.com");
  });

  test("handles waitlist subscription on the premium tier", async ({ page }) => {
    await page.route("**/api/subscribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message:
            "You're on the waitlist for the $29/mo Premium Market Efficiency Report. It isn't on sale yet and you have not been charged — we'll email you when it opens. No charge was made.",
        }),
      });
    });

    await page.goto("/subscribe");

    // Select Premium Pro tier
    const premiumBtn = page.getByRole("button", { name: /Premium Pro Research/i });
    await premiumBtn.click();

    // Fill in email
    const emailInput = page.getByPlaceholder("founder@company.com");
    await emailInput.fill("pro-subscriber@example.com");

    // Click waitlist submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toHaveText("Join the waitlist");
    await submitButton.click();

    // Assert status message acknowledges waitlist & no charge
    const statusMsg = page.getByRole("status");
    await expect(statusMsg).toBeVisible();
    await expect(statusMsg).toContainText("waitlist");
    await expect(statusMsg).toContainText("No charge was made");
  });
});
