// Demo story (e): legal pages render; unauthenticated org URLs bounce to /login. Plus a guard that the
// server under test really is the offline fake-externals build (no real LLM/email calls in e2e).
import { expect, test } from "@playwright/test";

test("server under test runs with FAKE_EXTERNALS", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true, fake: true });
});

const LEGAL = [
  { key: "terms", title: "Terms of Service" },
  { key: "privacy", title: "Privacy Policy" },
  { key: "data-use", title: "Data Use Policy" },
  { key: "refunds", title: "Refund Policy" },
];

for (const doc of LEGAL) {
  test(`legal page /legal/${doc.key} renders`, async ({ page }) => {
    await page.goto(`/legal/${doc.key}`);
    await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(doc.title));
  });
}

test("unauthenticated /orgs/x redirects to /login", async ({ page }) => {
  await page.goto("/orgs/x");
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("heading", { name: /sign in|log in|welcome back/i })).toBeVisible();
});
