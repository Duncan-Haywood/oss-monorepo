// Demo story (a): landing -> sign up (terms) -> onboarding step 1 creates the org -> dashboard.
import { expect, test } from "@playwright/test";
import {
  apiCreateOrg,
  apiSignUp,
  fixmeIfStub,
  orgPath,
  PASSWORD,
  uniqueEmail,
  waitForApi,
} from "./helpers";

async function signUpThroughUi(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page
    .getByRole("link", { name: /get started/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

  await page.getByLabel("Your name").fill("Demo Tester");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree/i }).check();

  const signedUp = waitForApi(page, "POST", /\/api\/auth\/sign-up\/email$/);
  await page.getByRole("button", { name: /create account/i }).click();
  expect((await signedUp).ok(), "sign-up request failed").toBe(true);
  await expect(page).toHaveURL(/\/onboarding/);
}

test.describe("signup + onboarding", () => {
  test("landing → sign up with terms → lands on onboarding", async ({ page }) => {
    await signUpThroughUi(page, uniqueEmail("signup"));
    const me = await page.request.get("/api/me");
    expect(me.ok()).toBe(true);
    const body = (await me.json()) as { user: { email: string }; memberships: unknown[] };
    expect(body.memberships).toHaveLength(0);
  });

  test("sign up requires accepting the terms", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("No Terms");
    await page.getByLabel(/email/i).fill(uniqueEmail("noterms"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /agree/i })).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("onboarding step 1 creates the org → dashboard loads", async ({ page }) => {
    await signUpThroughUi(page, uniqueEmail("onboard"));
    await fixmeIfStub(
      page,
      "Onboarding page is still the stub (src/client/routes/onboarding/onboarding.tsx does not render OrganizationStep yet)",
    );

    const orgName = `Mesa Ridge Pantry ${Date.now().toString(36)}`;
    await page.getByLabel("Organization name").fill(orgName);
    await page.getByLabel("Legal name").fill(`${orgName}, Inc.`);
    await page.getByRole("checkbox", { name: /I agree/i }).check();

    const created = waitForApi(page, "POST", /^\/api\/orgs\/?$/);
    await page.getByRole("button", { name: /create organization/i }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    const { orgId } = (await res.json()) as { orgId: string };

    // Step 1 is done once the org exists; later onboarding steps are optional, so open the dashboard.
    await page.waitForLoadState("domcontentloaded");
    await page.goto(orgPath(orgId));
    await expect(page).toHaveURL(new RegExp(`/orgs/${orgId}/?$`));
    await expect(page.getByRole("heading", { name: orgName }).first()).toBeVisible();
  });

  test("dashboard loads for a freshly created org", async ({ page }) => {
    await apiSignUp(page, "dash");
    const orgName = `Dashboard Org ${Date.now().toString(36)}`;
    const orgId = await apiCreateOrg(page, orgName);
    await page.goto(orgPath(orgId));
    await expect(page.getByRole("heading", { name: orgName }).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/orgs/${orgId}/?$`));
  });
});
