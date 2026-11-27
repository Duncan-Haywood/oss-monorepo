// The product's core loop, through the browser: sign up, build a rate card, paste an RFQ, check the AI's
// reading, price a line from the rate card, send the quote, record the win, see it in win/loss.
// Offline: FakeLlm reads test/fixtures/rfq.ts by rule; prices come only from the rate card typed below.
import { expect, test } from "@playwright/test";
import { card, field, RFQ_EMAIL, signUpWithShop } from "./helpers";

test("RFQ email to a priced, sent and won quote", async ({ page }) => {
  const { orgPath } = await signUpWithShop(page, { tag: "flow", shop: "E2E Machine Shop" });

  // Rate card: one mill, one material priced by weight, one outside finish.
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

  // Paste the RFQ; creating it runs the extraction.
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ - brackets and spacers");
  await field(newRfq, "Paste the RFQ email").fill(RFQ_EMAIL);
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "RFQ - brackets and spacers" }),
  ).toBeVisible();

  // Every extracted value shows the RFQ text it came from, and starts unconfirmed.
  const bracket = card(page, /^BRK-1001/);
  await expect(bracket.getByText("needs review")).toBeVisible();
  await expect(bracket.getByText("From the RFQ: “Qty: 10, 50, 100”")).toBeVisible();
  await expect(field(bracket, "Quantities")).toHaveValue("10, 50, 100");
  await expect(field(bracket, "Revision")).toHaveValue("B");
  await expect(card(page, /^SPC-220/)).toBeVisible();
  // Matched to the rate card by grade, and flagged as a suggestion.
  await expect(field(bracket, "Rate-card material")).toHaveValue(/.+/);
  await expect(bracket.getByText("Suggested from the grade; check it")).toBeVisible();

  const quoteButton = page.getByRole("button", { name: /^Quote \d+ confirmed parts?$/ });
  await expect(quoteButton).toHaveText("Quote 0 confirmed parts");
  await expect(quoteButton).toBeDisabled();
  await bracket.getByRole("button", { name: "Confirm" }).click();
  await expect(bracket.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(quoteButton).toHaveText("Quote 1 confirmed part");
  await quoteButton.click();

  // A new quote: the line carries the RFQ's part, but nothing is priced until the inputs exist.
  await page.waitForURL(/\/quotes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Quote Q-\d+/ })).toBeVisible();
  const line = card(page, /^BRK-1001/);
  await expect(line.getByText("needs inputs")).toBeVisible();
  await expect(line.getByText("Add at least one machine operation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark sent" })).toBeDisabled();
  await expect(line.getByLabel("Anodize Type II black")).toBeChecked();

  // 4 x 3 x 0.5 in plate, one 60 min setup, 12 min a part.
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

  // Worked by hand from the rate card above (markups are 0% on a new shop):
  //  material  4 x 3 x 0.5 = 6 in³ x 0.0975 lb/in³ = 0.585 lb x $4.50 x 1.10 scrap = $2.89575 a part
  //  setup     60 min at $95/h = $95.00, once per quantity break
  //  run       12 min a part at $95/h = $19.00 a part
  //  anodize   $3.00 a part, lot minimum $150.00
  //  qty 10:   28.96 + 95 + 190 + 150 = $463.96 -> unit $46.40 (rounded up to the cent), total $464.00
  //  qty 50:   144.79 + 95 + 950 + 150 = $1,339.79 -> unit $26.80, total $1,340.00
  //  qty 100:  289.58 + 95 + 1,900 + 300 = $2,584.58 -> unit $25.85, total $2,585.00
  const rows = line.locator("table tbody tr");
  await expect(rows).toHaveCount(3);
  const cells = (i: number) => rows.nth(i).locator("td");
  await expect(cells(0)).toHaveText([
    "10",
    "$28.96",
    "$95.00",
    "$190.00",
    "$150.00",
    "$0.00",
    "$0.00",
    "$46.40",
    "$464.00",
  ]);
  await expect(cells(1)).toHaveText([
    "50",
    "$144.79",
    "$95.00",
    "$950.00",
    "$150.00",
    "$0.00",
    "$0.00",
    "$26.80",
    "$1,340.00",
  ]);
  await expect(cells(2)).toHaveText([
    "100",
    "$289.58",
    "$95.00",
    "$1,900.00",
    "$300.00",
    "$0.00",
    "$0.00",
    "$25.85",
    "$2,585.00",
  ]);
  // The breakdown says where each number came from.
  await expect(
    line.getByText(
      "Material: Aluminum 6061-T6 plate, 0.585 lb per part at $4.50/lb plus 10% scrap, minimum $25.00",
    ),
  ).toBeVisible();
  await expect(line.getByText("Internal: costs, rates and markup never appear")).toBeVisible();

  // The customer PDF renders.
  const quoteUrl = page.url();
  const pdfHref = await page.getByRole("link", { name: "Preview PDF" }).getAttribute("href");
  expect(pdfHref).toBeTruthy();
  const pdf = await page.request.get(pdfHref as string);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Send, then record the win.
  await page.getByRole("button", { name: "Mark sent" }).click();
  const outcome = card(page, "Outcome");
  await expect(outcome).toBeVisible();
  await expect(page.getByRole("link", { name: "Sent PDF" })).toBeVisible();
  await field(outcome, "PO number").fill("PO-7781");
  await field(outcome, "Won amount $").fill("464");
  await outcome.getByRole("button", { name: "Won", exact: true }).click();
  await expect(page.getByText("won", { exact: true }).first()).toBeVisible();

  // The quote log and win/loss see it.
  await page.goto(orgPath);
  const log = card(page, "Quote log");
  await expect(log.getByRole("cell", { name: "Example Robotics LLC" })).toBeVisible();
  await page.goto(`${orgPath}/win-loss`);
  await expect(page.getByRole("heading", { level: 1, name: "Win/loss" })).toBeVisible();
  const byCustomer = card(page, "By customer");
  await expect(byCustomer.getByRole("row", { name: /Example Robotics LLC/ })).toContainText("$464");

  // A sent quote is read-only: no line editing.
  await page.goto(quoteUrl);
  await expect(page.getByRole("button", { name: "Save line" })).toHaveCount(0);
});
