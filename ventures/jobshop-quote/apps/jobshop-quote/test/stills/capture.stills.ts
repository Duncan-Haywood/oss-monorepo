// Screenshots of the real app for the marketing site (apps/jobshop-site). Not a test the suite runs:
// `pnpm stills` runs it against the offline e2e server (playwright.stills.config.ts). PNGs go to
// test/stills/out/ (ignored); the ones the site shows are re-encoded as WebP by the same Chromium (no
// image library) into apps/jobshop-site/public/shots/. Then run `pnpm export:catalogue` in
// apps/jobshop-site.
//
// Only what the hosted app does today is shown: AI reading of RFQs is not switched on there, so the
// part is entered by hand and the blank and operations are typed on the quote line. Every name is
// invented and the site's captions say so. The quote's figures are asserted against the hand check in
// test/e2e/01-rfq-to-quote.spec.ts (same rate card, same part), so a still can never show a price the
// arithmetic doesn't back.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { card, field } from "../e2e/helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const SITE_SHOTS = join(HERE, "..", "..", "..", "jobshop-site", "public", "shots");

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

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

/** The viewport (not the full page): the site shows these at a fixed aspect ratio. */
async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await settle(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
}

test("stills of a made-up machine shop quote", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });

  // A fixed address: the e2e server starts from an empty database, and the header shows it.
  await page.goto("/sign-up");
  await field(page, "Name").fill("Sam Example");
  await field(page, "Email").fill("sam@example.com");
  await field(page, "Password").fill("stills-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await field(page, "Shop name").fill("Example Precision");
  await page.getByRole("button", { name: "Create shop" }).click();
  await page.waitForURL(/\/app\/[^/]+\/rate-card$/);
  const orgPath = new URL(page.url()).pathname.replace(/\/rate-card$/, "");

  // Rate card: two machines, two materials, one outside finish.
  const machines = card(page, "Machines and work centers");
  for (const [name, kind, rate] of [
    ["Haas VF-2", "mill_3axis", "95"],
    ["Okuma LB3000 lathe", "lathe", "105"],
  ] as const) {
    await field(machines, "Name").fill(name);
    await field(machines, "Kind").selectOption(kind);
    await field(machines, "$/hour").fill(rate);
    await machines.getByRole("button", { name: "Add machine" }).click();
    await expect(machines.getByRole("cell", { name })).toBeVisible();
  }
  const materials = card(page, "Materials");
  for (const [name, perLb, density, min] of [
    ["Aluminum 6061-T6 plate", "4.50", "0.0975", "25"],
    ["303 stainless bar", "6.20", "0.289", "40"],
  ] as const) {
    await field(materials, "Name").fill(name);
    await field(materials, "$/lb").fill(perLb);
    await field(materials, "Density lb/in³").fill(density);
    await field(materials, "Scrap %").fill("10");
    await field(materials, "Minimum charge $").fill(min);
    await materials.getByRole("button", { name: "Add material" }).click();
    await expect(materials.getByRole("cell", { name })).toBeVisible();
  }
  const finishing = card(page, "Finishing and outside services");
  await field(finishing, "Name").fill("Anodize Type II black");
  await field(finishing, "$ per part").fill("3");
  await field(finishing, "Lot minimum $").fill("150");
  await finishing.getByRole("button", { name: "Add finish" }).click();
  await expect(finishing.getByRole("cell", { name: "Anodize Type II black" })).toBeVisible();
  // The rates themselves, scrolled to the machines (the shop's settings sit above them).
  await page
    .getByRole("heading", { name: "Machines and work centers" })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -40));
  await shot(page, "rate-card-desktop");

  // An RFQ whose part is entered by hand (the offline extractor may add an empty part; it is removed).
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("Motor mount brackets");
  await field(newRfq, "Paste the RFQ email").fill("Please quote BRK-1001 Rev B, drawing attached.");
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Motor mount brackets" })).toBeVisible();
  const customer = card(page, "Customer");
  await field(customer, "Company").fill("Example Robotics LLC");
  await field(customer, "Contact").fill("Dana Example");
  await customer.getByRole("button", { name: "Save" }).click();
  await settle(page);
  const parts = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^New part/ }) });
  while ((await parts.count()) > 0) {
    const n = await parts.count();
    await parts.first().getByRole("button", { name: "Remove" }).click();
    await expect(parts).toHaveCount(n - 1);
  }
  await page.getByRole("button", { name: "Add part by hand" }).click();
  await expect(parts.first()).toBeVisible();
  await field(parts.first(), "Part number").fill("BRK-1001");
  // The card's heading follows the part number as it is typed.
  const part = card(page, /^BRK-1001/);
  await field(part, "Revision").fill("B");
  await field(part, "Description").fill("Motor mount bracket");
  await field(part, "Quantities").fill("10, 50, 100");
  await field(part, "Material (as written)").fill("6061-T6 aluminum plate");
  await field(part, "Rate-card material").selectOption({ label: "Aluminum 6061-T6 plate" });
  await field(part, "Finish (as written)").fill("Black anodize Type II");
  await part.getByLabel("Anodize Type II black").check();
  await part.getByRole("button", { name: "Save" }).click();
  await settle(page);
  await part.getByRole("button", { name: "Confirm" }).click();
  await expect(part.getByText("confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quote 1 confirmed part" }).click();

  // The quote line: 4 x 3 x 0.5 in plate, one 60 min setup, 12 min a part.
  await page.waitForURL(/\/quotes\/[^/]+$/);
  const line = card(page, /^BRK-1001/);
  await field(line, "Blank").selectOption({ label: "Plate / block (L×W×T in)" });
  await field(line, "Length in").fill("4");
  await field(line, "Width in").fill("3");
  await field(line, "Thickness in").fill("0.5");
  await line.getByRole("button", { name: "+ Operation" }).click();
  await field(line, "Op").fill("Op 10 mill");
  await field(line, "Setup min").fill("60");
  await field(line, "Cycle min/pc").fill("12");
  await line.getByRole("button", { name: "Save line" }).click();
  await expect(line.getByText("priced", { exact: true })).toBeVisible();

  // The hand check in 01-rfq-to-quote.spec.ts: unit $46.40 / $26.80 / $25.85, total $464 / $1,340 /
  // $2,585.
  const rows = line.locator("table tbody tr");
  await expect(rows).toHaveCount(3);
  for (const [i, unit, total] of [
    [0, "$46.40", "$464.00"],
    [1, "$26.80", "$1,340.00"],
    [2, "$25.85", "$2,585.00"],
  ] as const) {
    await expect(rows.nth(i).locator("td").nth(7)).toHaveText(unit);
    await expect(rows.nth(i).locator("td").nth(8)).toHaveText(total);
  }
  const quoteUrl = page.url();
  // The quote line from its heading down: inputs on the left, the priced table and breakdown right.
  await line.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -16));
  await shot(page, "quote-line-desktop");

  // The same quote on a phone, in the same signed-in session.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const p = await phone.newPage();
  await p.goto(quoteUrl);
  await expect(p.getByRole("heading", { level: 1, name: /^Quote Q-\d+/ })).toBeVisible();
  // Clipped to the line's price table and the breakdown under it (the cover-note card below offers
  // AI drafting, which the hosted app has not switched on).
  await settle(p);
  const table = p.locator("table").first();
  await table.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const top = await table.boundingBox();
  const end = await p.getByText("Internal: costs, rates and markup never appear").boundingBox();
  if (!top || !end) throw new Error("price table or breakdown not on screen");
  await p.screenshot({
    path: join(OUT, "quote-phone.png"),
    animations: "disabled",
    caret: "hide",
    clip: { x: 0, y: top.y - 24, width: 390, height: end.y + end.height + 24 - (top.y - 24) },
  });
  await phone.close();

  // What the shop's customer sees: mark it sent, copy a customer link, open it with no session.
  await page.goto(quoteUrl);
  await page.getByRole("button", { name: "Mark sent" }).click();
  await expect(page.getByRole("link", { name: "Sent PDF" })).toBeVisible();
  const links = card(page, "Customer's answer online");
  await links.getByRole("button", { name: "Copy a customer link" }).click();
  const linkPath = new URL(await field(links, "The link (shown once: copy it now)").inputValue())
    .pathname;
  const buyer = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const c = await buyer.newPage();
  await c.goto(linkPath);
  await expect(c.getByText("Example Precision", { exact: true })).toBeVisible();
  // The customer's page carries the prices, never the costs behind them.
  for (const unit of ["$46.40", "$26.80", "$25.85"])
    await expect(c.getByText(unit).first()).toBeVisible();
  await expect(c.getByText("$95.00")).toHaveCount(0);
  await settle(c);
  // Down to the "Sent with" line under the cards (the legal links below it are left out).
  const sentWith = await c.getByText(/^Sent with /).boundingBox();
  if (!sentWith) throw new Error("the customer page's footer line is missing");
  await c.screenshot({
    path: join(OUT, "customer-quote-phone.png"),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    clip: { x: 0, y: 0, width: 390, height: Math.ceil(sentWith.y + sentWith.height + 20) },
  });

  // The PDF as sent, first page, rasterised by poppler's pdftoppm (Chromium's headless mode has no
  // PDF viewer). A US Letter page at 150 dpi is 1275 px wide; the still keeps its top 5 inches
  // (header, customer, the priced part), since a one-part quote leaves the rest of the page blank.
  const pdf = await c.request.get(`${linkPath.replace("/q/", "/api/quote-links/")}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "quote.pdf"), await pdf.body());
  try {
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "150",
      "-f",
      "1",
      "-l",
      "1",
      "-x",
      "0",
      "-y",
      "0",
      "-W",
      "1275",
      "-H",
      "750",
      "-singlefile",
      join(OUT, "quote.pdf"),
      join(OUT, "customer-pdf-page1"),
    ]);
  } catch (e) {
    throw new Error(`pdftoppm (poppler-utils) is needed for the PDF still: ${String(e)}`);
  }
  renameSync(join(OUT, "customer-pdf-page1.png"), join(OUT, "customer-pdf.png"));
  await buyer.close();

  for (const name of [
    "rate-card-desktop",
    "quote-line-desktop",
    "quote-phone",
    "customer-quote-phone",
    "customer-pdf",
  ])
    await toSite(page, name);
  expect(orgPath).toMatch(/^\/app\//);
});
