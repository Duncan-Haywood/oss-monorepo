// The free tools' "Start free" links carry `from=<page>`: a visitor arriving on /signup with one
// keeps it in this browser until signed in, then the app posts it once (POST /api/me/signup-source)
// and forgets it. The worker side and the owner metrics are in test/worker/signup-source.test.ts.
import { expect, test } from "@playwright/test";
import { labelled, uniqueEmail } from "./helpers";

test("a sign-up from a free tool's link records that page once", async ({ page }) => {
  await page.goto("/signup?from=ebay-fee-calculator%2Fschedule-c-worksheet-for-resellers");
  expect(await page.evaluate(() => localStorage.getItem("sellerBooks.signupSource"))).toContain(
    "ebay-fee-calculator/schedule-c-worksheet-for-resellers",
  );
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/me/signup-source") && r.request().method() === "POST",
  );
  await labelled(page, "Your name").fill("E2E Source");
  await labelled(page, "Email").fill(uniqueEmail("source"));
  await labelled(page, "Password (10+ characters)").fill("e2e-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  const res = await posted;
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    recorded: true,
    source: "ebay-fee-calculator/schedule-c-worksheet-for-resellers",
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("sellerBooks.signupSource")))
    .toBeNull();
});
