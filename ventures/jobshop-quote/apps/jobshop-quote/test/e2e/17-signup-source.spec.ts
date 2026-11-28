// The free guides' and marketing site's "Start free" links carry `from=<page>`: a visitor arriving on /sign-up with one
// keeps it in this browser until signed in, then the app posts it once (POST /api/me/signup-source)
// and forgets it. The worker side and the owner metrics are in test/worker/signup-source.test.ts.
import { expect, test } from "@playwright/test";
import { field, uniqueEmail } from "./helpers";

test("a sign-up from a free guide's link records that page once", async ({ page }) => {
  await page.goto("/sign-up?from=machine-shop-guides%2Fcnc-cycle-time");
  expect(await page.evaluate(() => localStorage.getItem("jobshopQuote.signupSource"))).toContain(
    "machine-shop-guides/cnc-cycle-time",
  );
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/me/signup-source") && r.request().method() === "POST",
  );
  await field(page, "Name").fill("E2E Source");
  await field(page, "Email").fill(uniqueEmail("source"));
  await field(page, "Password").fill("e2e-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  const res = await posted;
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    recorded: true,
    source: "machine-shop-guides/cnc-cycle-time",
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("jobshopQuote.signupSource")))
    .toBeNull();
});
