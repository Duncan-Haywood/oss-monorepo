import { test, expect } from "@playwright/test";
import { setAuthenticatedSession } from "./helpers";

test.describe("Auth Posture & Protected Research Journeys", () => {
  test("unauthenticated visitors to protected research paths are redirected to login", async ({
    page,
  }) => {
    await page.goto("/market-map");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fmarket-map/);
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();

    await page.goto("/ideas");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fideas/);

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/login\?redirect=%2Freports/);
  });

  test("authenticated members can access market map, ideas, and reports", async ({
    page,
    context,
    baseURL,
  }) => {
    await setAuthenticatedSession(context, "test@example.com", baseURL);

    // Access Market Map
    await page.goto("/market-map");
    await expect(page).toHaveURL(/\/market-map$/);
    await expect(
      page.getByRole("heading", { name: /Target markets where work is labor/i }),
    ).toBeVisible();

    // Access Ideas & detail view
    await page.goto("/ideas");
    await expect(page).toHaveURL(/\/ideas$/);
    await expect(
      page.getByRole("heading", { name: "Business Ideas" }),
    ).toBeVisible();

    // Click into an idea detail page
    const firstIdeaLink = page.getByRole("link", { name: /#1/i }).first();
    await firstIdeaLink.click();
    await expect(page).toHaveURL(/\/ideas\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { name: "AI leverage" })).toBeVisible();

    // Access Reports & detail view
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("heading", { name: "Reports" }),
    ).toBeVisible();

    // Click into executive summary report
    const execSummaryLink = page.getByRole("link", { name: /Executive Summary/i }).first();
    await execSummaryLink.click();
    await expect(page).toHaveURL(/\/reports\/[a-z0-9-]+$/);
  });
});
