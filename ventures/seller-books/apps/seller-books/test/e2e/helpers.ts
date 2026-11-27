// Shared steps for the e2e specs. Every spec signs up its own user and shop, so specs never share data.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";
import { fakeWebhookRequest, signCheckoutToken } from "../../../../packages/billing/src/index.ts";
import { E2E_AUTH_SECRET } from "./secret";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));

/** A committed report fixture (test/fixtures), as the upload control receives it. */
export function fixture(name: string) {
  return {
    name,
    mimeType: "text/csv",
    buffer: readFileSync(new URL(`../fixtures/${name}`, import.meta.url)),
  };
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** The <input> or <select> inside the <label> whose caption is exactly `caption`. */
export function labelled(scope: Locator | Page, caption: string): Locator {
  const page = "page" in scope ? scope.page() : scope;
  return scope
    .locator("label", { has: page.locator("span.label", { hasText: caption }) })
    .locator("input, select, textarea")
    .first();
}

/** A form or section card by its heading. */
export function card(page: Page, title: string | RegExp): Locator {
  return page.locator("section, form").filter({ has: page.getByRole("heading", { name: title }) });
}

/**
 * Sign up through the UI (no confirmation mail with FAKE_EXTERNALS), accept the legal notice if it is
 * shown, and create a shop. Returns the shop's id and its app path (`/o/<orgId>`).
 */
export async function signUpWithShop(page: Page, opts: { tag: string; shop: string }) {
  const email = uniqueEmail(opts.tag);
  await page.goto("/signup");
  await labelled(page, "Your name").fill("E2E Reseller");
  await labelled(page, "Email").fill(email);
  await labelled(page, "Password (10+ characters)").fill("e2e-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  const shopName = page.getByPlaceholder("New shop name");
  const agree = page.getByRole("button", { name: "I agree" });
  await expect(shopName.or(agree)).toBeVisible();
  if (await agree.isVisible()) await agree.click();
  await shopName.fill(opts.shop);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/o\/[^/]+$/);
  const orgPath = new URL(page.url()).pathname;
  return { email, orgPath, orgId: orgPath.split("/")[2] as string };
}

/** Open a page of the shop from the side navigation (the way a person moves around). */
export async function nav(page: Page, label: string) {
  await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
}

/** Upload one report on the Imports page and wait for its summary line. */
export async function importReport(page: Page, reportLabel: string, file: string) {
  await nav(page, "Imports");
  await labelled(page, "Report").selectOption({ label: reportLabel });
  await labelled(page, "CSV file").setInputFiles(fixture(file));
  await page.getByRole("button", { name: "Import", exact: true }).click();
}

/**
 * Read one value from the e2e server's local D1 (.wrangler/e2e), through wrangler as the server
 * script applies migrations. Only for what the browser never sees, like a pending checkout's id.
 */
export function d1Query<T>(sql: string): T[] {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      ".wrangler/e2e",
      "--json",
      "--command",
      sql,
    ],
    { cwd: APP_DIR, encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  const parsed = JSON.parse(out) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

/** Sign in through the form with an existing account. */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await labelled(page, "Email").fill(email);
  await labelled(page, "Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Keep only id characters, for the few values interpolated into d1Query's SQL. */
export const sqlId = (s: string) => s.replace(/[^\w-]/g, "");

/**
 * Confirm the shop's newest pending checkout the way the payment provider would: sign the checkout
 * token as the worker does and post the fake provider's signed `subscription.created` webhook.
 * Call it after the Billing page's "Choose <plan>" button has started a (fake) checkout.
 */
export async function confirmCheckout(
  page: Page,
  baseURL: string | undefined,
  orgId: string,
  planKey: string,
) {
  const [pending] = d1Query<{ id: string }>(
    `SELECT id FROM pending_checkouts WHERE org_id = '${sqlId(orgId)}' ORDER BY created_at DESC LIMIT 1`,
  );
  expect(pending?.id).toMatch(/^pco_/);
  const token = await signCheckoutToken(E2E_AUTH_SECRET, pending?.id ?? "", orgId);
  const req = await fakeWebhookRequest(`${baseURL}/api/billing/webhook`, {
    providerEventId: `evt_e2e_${orgId}_${planKey}`,
    type: "subscription.created",
    occurredAt: new Date().toISOString(),
    customData: { checkoutToken: token },
    subscription: {
      planKey,
      status: "active",
      providerCustomerId: `ctm_e2e_${orgId}`,
      providerSubscriptionId: `sub_e2e_${orgId}`,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
  });
  const res = await page.request.fetch(req.url, {
    method: "POST",
    headers: Object.fromEntries(req.headers),
    data: await req.text(),
  });
  expect(await res.json()).toEqual({ outcome: "applied" });
}
