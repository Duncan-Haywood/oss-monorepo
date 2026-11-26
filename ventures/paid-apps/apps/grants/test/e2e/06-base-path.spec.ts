// The app under a path prefix, as production serves it (https://marisstella.app/grants/). Runs only
// when the server was started with E2E_BASE_PATH (grants-ci runs it with /grants); the other specs
// cover the app at the host root. Checks what unit and worker tests cannot: Vite's base, the router
// basepath, client-side navigation through HrefLink, and the Path=<base> session cookie in a browser.
import { expect, test } from "@playwright/test";
import { normalizeBasePath } from "../../src/shared/base-path";
import { PASSWORD, uniqueEmail, waitForApi } from "./helpers";

const base = normalizeBasePath(process.env.E2E_BASE_PATH);

test.describe("app under a base path", () => {
  test.skip(!base, "set E2E_BASE_PATH (e.g. /grants) to run");

  test("sign up, create an org and navigate in-app, all under the prefix", async ({ page }) => {
    await page.goto(`${base}/signup`);
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

    await page.getByLabel("Your name").fill("Base Path Tester");
    await page.getByLabel(/email/i).fill(uniqueEmail("basepath"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox", { name: /I agree/i }).check();

    const signedUp = waitForApi(page, "POST", new RegExp(`^${base}/api/auth/sign-up/email$`));
    await page.getByRole("button", { name: /create account/i }).click();
    expect((await signedUp).ok(), "sign-up request failed").toBe(true);
    await expect(page).toHaveURL(new RegExp(`${base}/onboarding`));

    // The session cookie is scoped to the prefix, and it authenticates the prefixed API.
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => /session_token/.test(c.name));
    expect(session?.path, "session cookie path").toBe(base);
    const me = await page.request.get(`${base}/api/me`);
    expect(me.ok(), "GET <base>/api/me with the session cookie").toBe(true);

    const orgName = `Prefix Pantry ${Date.now().toString(36)}`;
    await page.getByLabel("Organization name").fill(orgName);
    await page.getByLabel("Legal name").fill(`${orgName}, Inc.`);
    await page.getByRole("checkbox", { name: /I agree/i }).check();
    const created = waitForApi(page, "POST", new RegExp(`^${base}/api/orgs/?$`));
    await page.getByRole("button", { name: /create organization/i }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    const { orgId } = (await res.json()) as { orgId: string };

    await page.goto(`${base}/orgs/${orgId}`);
    await expect(page.getByRole("heading", { name: orgName }).first()).toBeVisible();

    // Client-side navigation keeps the prefix (router basepath + HrefLink/Link).
    const help = page.getByRole("link", { name: /^help/i }).first();
    await help.click();
    await expect(page).toHaveURL(new RegExp(`^[^?#]*${base}/orgs/${orgId}/help`));
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    // Nothing the app loaded came from outside the prefix (assets, API, auth).
    const outside: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.origin === new URL(page.url()).origin && !u.pathname.startsWith(`${base}/`)) {
        outside.push(`${r.method()} ${u.pathname}`);
      }
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(outside, "same-origin requests outside the base path").toEqual([]);
  });
});
