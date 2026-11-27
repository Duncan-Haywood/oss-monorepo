// Shared steps for the e2e specs. Every spec signs up its own user and company, so specs never share
// data and can run in any order.
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-only";

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** A text box by its accessible name, matched exactly (the forms have "Item" and "Item number"). */
export const box = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

/**
 * Sign up the way the free guides send people (`/?signup&from=...`), agree to the policies, and add
 * the company. With FAKE_EXTERNALS the confirmation email goes to the in-memory fake and is not
 * required. Returns the company's app path (`/orgs/<orgId>`).
 */
export async function signUpWithCompany(page: Page, opts: { tag: string; company: string }) {
  const email = uniqueEmail(opts.tag);
  await page.goto("/?signup&from=pay-app-guides/e2e");
  await expect(page.getByRole("heading", { name: "Create an account", level: 1 })).toBeVisible();
  await box(page, "Your name").fill("E2E Subcontractor");
  await box(page, "Email").fill(email);
  await box(page, "Password (10+ characters)").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await box(page, "Company name (shown as the contractor on pay apps)").fill(opts.company);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  const orgPath = new URL(page.url()).pathname;
  return { email, orgPath, orgId: orgPath.split("/")[2] as string };
}

export interface JobInput {
  name: string;
  number: string;
  gc: string;
  owner: string;
  contractSum: string;
  retainagePct?: string;
}

/** Fill the "New project" form on the company page and wait for the job's own page. */
export async function createJob(page: Page, job: JobInput) {
  await box(page, "Project name").fill(job.name);
  await box(page, "Project / job number").fill(job.number);
  await box(page, "General contractor").fill(job.gc);
  await box(page, "Owner").fill(job.owner);
  await box(page, "Original contract sum ($)").fill(job.contractSum);
  if (job.retainagePct !== undefined) await box(page, "Retainage %").fill(job.retainagePct);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: `${job.name} (${job.number})` }),
  ).toBeVisible();
}

/** Type schedule-of-values lines one at a time, as a contractor without a spreadsheet would. */
export async function addSovLines(
  page: Page,
  lines: [item: string, description: string, value: string][],
) {
  const table = page
    .getByRole("heading", { name: "Schedule of values", level: 2 })
    .locator("xpath=following::table[1]");
  for (const [item, description, value] of lines) {
    await box(page, "Item").fill(item);
    await box(page, "Description of work").fill(description);
    await box(page, "Value ($)").fill(value);
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(table.getByRole("cell", { name: description, exact: true })).toBeVisible();
  }
}
