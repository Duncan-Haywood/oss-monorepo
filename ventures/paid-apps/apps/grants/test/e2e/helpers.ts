// Shared helpers for the demo-flow e2e specs. Every test signs up a brand-new user (unique email) so
// tests are independent and can run in any order against the same server.
import { fileURLToPath } from "node:url";
import { type APIResponse, expect, type Page, test } from "@playwright/test";
import { guideKeys } from "../../src/client/components/guide/storage";
import { POLICY_VERSION } from "../../src/shared/legal";

export const PASSWORD = "e2e-Correct-Horse-42";

export function uniqueEmail(tag: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-${tag}-${Date.now().toString(36)}-${rand}@example.org`;
}

export const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export const orgPath = (orgId: string, sub = "") => `/orgs/${encodeURIComponent(orgId)}${sub}`;

/**
 * Same-origin `Origin` header for state-changing calls made with `page.request` (shares the page's
 * cookie jar). Better Auth and our CSRF `originCheck` both compare it with APP_URL.
 */
export function originHeaders(page: Page) {
  const base = test.info().project.use.baseURL ?? new URL(page.url()).origin;
  return { Origin: new URL(base).origin };
}

async function ok(res: APIResponse, what: string) {
  expect(res.ok(), `${what} -> ${res.status()} ${await res.text().catch(() => "")}`).toBe(true);
  return res;
}

/** Sign up through the API (fast path for tests that aren't about sign-up). Sets the session cookie. */
export async function apiSignUp(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  await ok(
    await page.request.post("/api/auth/sign-up/email", {
      headers: originHeaders(page),
      data: { name: "E2E Tester", email, password: PASSWORD },
    }),
    "sign-up",
  );
  await skipGuideTours(page);
  return { email };
}

/**
 * Opts the signed-in user out of automatic guide tours: their full-page coach-mark overlay would
 * sit over whatever the spec clicks next. The tours have their own tests in components/guide.
 */
export async function skipGuideTours(page: Page) {
  const res = await ok(await page.request.get("/api/me"), "me");
  const me = (await res.json()) as { user: { id: string } };
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (e.g. about:blank): nothing to opt out of there.
    }
  }, guideKeys.toursOptOut(me.user.id));
}

/** Create an org for the signed-in user exactly like onboarding step 1 does (POST /api/orgs). */
export async function apiCreateOrg(page: Page, name: string) {
  const res = await ok(
    await page.request.post("/api/orgs", {
      headers: originHeaders(page),
      data: {
        name,
        legalName: `${name}, Inc.`,
        orgType: "nonprofit_501c3",
        city: "Farmington",
        state: "NM",
        acceptTerms: true,
        policyVersion: POLICY_VERSION,
      },
    }),
    "create org",
  );
  const { orgId } = (await res.json()) as { orgId: string };
  expect(orgId).toBeTruthy();
  return orgId;
}

/** Fresh user + fresh org, signed in. */
export async function newOrgSession(page: Page, tag: string) {
  const { email } = await apiSignUp(page, tag);
  const orgName = `E2E ${tag} ${Date.now().toString(36)}`;
  const orgId = await apiCreateOrg(page, orgName);
  return { email, orgId, orgName };
}

/**
 * Marks the current test `fixme` when the page under test is still the placeholder stub
 * (`<PageHeader description="Coming soon." />`). Remove once every page is built.
 */
export async function fixmeIfStub(page: Page, reason: string) {
  // The stub renders its <h1> and "Coming soon." together; a real page renders its own header.
  await page
    .getByRole("heading", { level: 1 })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => undefined);
  const stub = await page
    .getByText("Coming soon.", { exact: true })
    .isVisible()
    .catch(() => false);
  test.fixme(stub, reason);
}

/** Waits for the next API response matching method + pathname regex. */
export function waitForApi(page: Page, method: string, path: RegExp) {
  return page.waitForResponse(
    (r) => r.request().method() === method && path.test(new URL(r.url()).pathname),
  );
}
