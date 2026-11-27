// Shared steps for the e2e specs. Every spec signs up its own user and shop, so specs never share data.
import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";

/** The synthetic RFQ email in test/fixtures/rfq.ts (invented company and parts). */
export const RFQ_EMAIL = readFileSync(new URL("../fixtures/rfq.ts", import.meta.url), "utf8").split(
  "`",
)[1] as string;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The input, select or textarea of a <Field label="...">. Matches the label text exactly, because a
 * field's accessible name also carries its hint ("Density lb/in³Al 6061 0.0975, ...") and "$/lb" is
 * also inside the "Priced" select's option text.
 */
export function field(scope: Locator | Page, label: string): Locator {
  const page = "page" in scope ? scope.page() : scope;
  return scope
    .locator("label", {
      has: page.locator("span", { hasText: new RegExp(`^${escapeRegExp(label)}$`) }),
    })
    .locator("input, select, textarea")
    .first();
}

/** A <Card> by its heading. */
export function card(page: Page, title: string | RegExp): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Sign up through the UI, accept the legal terms and create a shop; returns the org's app path. */
export async function signUpWithShop(page: Page, opts: { tag: string; shop: string }) {
  const email = uniqueEmail(opts.tag);
  await page.goto("/sign-up");
  await field(page, "Name").fill("E2E Estimator");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill("e2e-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Before you continue")).toBeVisible();
  await page.getByRole("button", { name: "I agree" }).click();
  await field(page, "Shop name").fill(opts.shop);
  await page.getByRole("button", { name: "Create shop" }).click();
  await page.waitForURL(/\/app\/[^/]+\/rate-card$/);
  const orgPath = new URL(page.url()).pathname.replace(/\/rate-card$/, "");
  return { email, orgPath, orgId: orgPath.split("/")[2] as string };
}

/** Same-origin JSON call with the page's session cookie (the API checks Origin on writes). */
export async function api<T = unknown>(
  request: APIRequestContext,
  baseURL: string,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(path, { method, data, headers: { Origin: baseURL } });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return (await res.json().catch(() => ({}))) as T;
}

/** The rate card 01-rfq-to-quote types: one mill at $95/h, 6061 plate by weight, one anodize. */
export async function addBasicRateCard(page: Page) {
  const machines = card(page, "Machines and work centers");
  await field(machines, "Name").fill("Haas VF-2");
  await field(machines, "$/hour").fill("95");
  await machines.getByRole("button", { name: "Add machine" }).click();
  await expect(machines.getByRole("cell", { name: "Haas VF-2" })).toBeVisible();

  const materials = card(page, "Materials");
  await field(materials, "Name").fill("Aluminum 6061-T6 plate");
  await field(materials, "$/lb").fill("4.50");
  await field(materials, "Density lb/in³").fill("0.0975");
  await field(materials, "Scrap %").fill("10");
  await field(materials, "Minimum charge $").fill("25");
  await materials.getByRole("button", { name: "Add material" }).click();
  await expect(materials.getByRole("cell", { name: "Aluminum 6061-T6 plate" })).toBeVisible();

  const finishing = card(page, "Finishing and outside services");
  await field(finishing, "Name").fill("Anodize Type II black");
  await field(finishing, "$ per part").fill("3");
  await field(finishing, "Lot minimum $").fill("150");
  await finishing.getByRole("button", { name: "Add finish" }).click();
  await expect(finishing.getByRole("cell", { name: "Anodize Type II black" })).toBeVisible();
}
