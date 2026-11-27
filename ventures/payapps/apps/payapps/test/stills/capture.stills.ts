// Screenshots of the real app for the marketing site. Not a test the suite runs: `pnpm stills` runs it
// against the offline e2e server (playwright.stills.config.ts). PNGs go to test/stills/out/ (ignored);
// the ones the site shows are re-encoded as WebP by the same Chromium (no image library) into
// apps/payapps-site/public/shots/. Then run `pnpm export:catalogue` in apps/payapps-site.
//
// The job is the site's worked example (apps/payapps-site/src/site/example.ts): a made-up electrical
// job, application #1 submitted and paid, application #2 drafted. Every name is invented and the
// site's captions say so. The figures are asserted below against the example's hand check, so a still
// can never show numbers the panel next to it contradicts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { addSovLines, box, createJob, PASSWORD } from "../e2e/helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const SITE_SHOTS = join(HERE, "..", "..", "..", "payapps-site", "public", "shots");

/** Re-encodes a PNG from OUT as WebP in the site's shots folder, using the browser's own encoder. */
async function toSite(page: Page, name: string) {
  const png = readFileSync(join(OUT, `${name}.png`)).toString("base64");
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.86);
  }, png);
  if (!dataUrl.startsWith("data:image/webp;base64,"))
    throw new Error("this Chromium cannot encode WebP");
  mkdirSync(SITE_SHOTS, { recursive: true });
  writeFileSync(
    join(SITE_SHOTS, `${name}.webp`),
    Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
  );
}

/** Period from, period to and the application date (the period's last day), in the form's order. */
/** Each changed field saves on blur, so wait for one save before the next (in parallel they race). */
async function setDates(page: Page, from: string, to: string) {
  for (const [label, value] of [
    ["Period from", from],
    ["Period to", to],
    ["Application date", to],
  ] as const) {
    const field = page.getByLabel(label, { exact: true });
    if ((await field.inputValue()) === value) continue; // unchanged fields save nothing
    const saved = page.waitForResponse(
      (r) => r.request().method() !== "GET" && r.url().includes("/api/") && r.ok(),
    );
    await field.fill(value);
    await field.blur();
    await saved;
  }
}

/** The card holding the application summary (lines 1 to 9). */
const summaryCard = (page: Page) =>
  page
    .locator(".card")
    .filter({ has: page.getByRole("row", { name: /^8 Current payment due/ }) })
    .last();

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  // Let fonts and the last re-render settle, then take the viewport (not the full page): the site
  // shows these at a fixed aspect ratio.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
}

test("stills of a made-up electrical job", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  await page.goto("/?signup");
  await box(page, "Your name").fill("Sam Example");
  // The e2e server starts from an empty database, so a fixed address is unique. It shows in the header.
  await box(page, "Email").fill("sam@example.com");
  await box(page, "Password (10+ characters)").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await box(page, "Company name (shown as the contractor on pay apps)").fill(
    "Example Electric LLC",
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);

  await createJob(page, {
    name: "Harbor Clinic Fit-out",
    number: "E-2409",
    gc: "Example Builders",
    owner: "Example Health",
    contractSum: "210,000",
  });
  await addSovLines(page, [
    ["1", "Rough-in, floors 1–2", "84,000"],
    ["2", "Switchgear and panels", "62,000"],
    ["3", "Lighting fixtures", "41,000"],
    ["4", "Trim, test and close-out", "23,000"],
  ]);
  const jobUrl = page.url();

  // Application #1 (period to Sep 30): $33,600 of rough-in, $24,800 of switchgear stored on site.
  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await setDates(page, "2026-09-01", "2026-09-30");
  await box(page, "Work this period, item 1").fill("33,600");
  await box(page, "Stored materials, item 2").fill("24,800");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /#1 submitted/ })).toBeVisible();
  const payments = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Payments received", level: 2 }),
  });
  await payments.getByRole("textbox", { name: "Check # or reference" }).fill("10418");
  await payments.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /#1 paid/ })).toBeVisible();

  // Application #2 (period to Oct 31): the switchgear is installed, fixtures arrive and are stored.
  await page.goto(jobUrl);
  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: /#2 draft/ })).toBeVisible();
  await setDates(page, "2026-10-01", "2026-10-31");
  await box(page, "Work this period, item 1").fill("25,200");
  await box(page, "Work this period, item 2").fill("31,000");
  await box(page, "Stored materials, item 2").fill("0");
  await box(page, "Stored materials, item 3").fill("12,300");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();

  // The example's hand check: $102,100 to date, $10,210 retainage, $52,560 previous, $39,330 due.
  const row = (name: string) => page.getByRole("row", { name, exact: true });
  await expect(row("4 Total completed and stored to date $102,100.00")).toBeVisible();
  await expect(row("8 Current payment due $39,330.00")).toBeVisible();
  const payAppUrl = page.url();

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "pay-app-2-desktop");
  await expect(page.getByText("Period start must be on or before period end")).toHaveCount(0);
  // The application summary (lines 1 to 9), scrolled to its heading.

  await page.goto(jobUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: /Harbor Clinic Fit-out/ }),
  ).toBeVisible();
  await shot(page, "job-desktop");

  // The same draft on a phone, in the same signed-in session.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const p = await phone.newPage();
  await p.goto(payAppUrl);
  await expect(p.getByRole("heading", { level: 1, name: /#2 draft/ })).toBeVisible();
  await shot(p, "pay-app-2-phone");
  await summaryCard(p).scrollIntoViewIfNeeded();
  await summaryCard(p).screenshot({ path: join(OUT, "pay-app-2-summary-phone.png") });
  await toSite(p, "pay-app-2-desktop");
  await toSite(p, "pay-app-2-summary-phone");
  await phone.close();
});
