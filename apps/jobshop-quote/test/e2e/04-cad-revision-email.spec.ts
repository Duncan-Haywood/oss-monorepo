// E2E part 2: an RFQ with a STEP file attached, the CAD suggestions on its quote line, the quote
// emailed (the offline server records it, nothing leaves), then a revision and its changes view.
// The STEP is written here by packages/cad-features' own test writer (a 4 x 3 x 0.5 in plate with
// two 0.25 in through holes) and measured for real: the offline server uses the real CAD parser.
import { expect, test } from "@playwright/test";
import { plate, StepWriter } from "../../../../packages/cad-features/test/helpers/step-writer";
import { addBasicRateCard, card, field, RFQ_EMAIL, signUpWithShop } from "./helpers";

function bracketStep(): Buffer {
  const w = new StepWriter();
  const solid = plate(w, {
    w: 4,
    h: 3,
    t: 0.5,
    zHoles: [
      { x: 1, y: 1.5, r: 0.125 },
      { x: 3, y: 1.5, r: 0.125 },
    ],
  });
  return Buffer.from(w.file([solid], "in"));
}

test("STEP attached to an RFQ sizes the blank; the quote is emailed, revised and compared", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "cad", shop: "E2E CAD Shop" });
  await addBasicRateCard(page);

  // The RFQ with the part's STEP file; the file name carries the part number, which links them.
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ - bracket with CAD");
  await field(newRfq, "Paste the RFQ email").fill(RFQ_EMAIL);
  await field(newRfq, "Drawings and attachments").setInputFiles({
    name: "BRK-1001-revB.step",
    mimeType: "application/step",
    buffer: bracketStep(),
  });
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);

  // The file is measured at upload: its box and holes show under Source.
  const source = card(page, "Source");
  await expect(source.getByRole("link", { name: "BRK-1001-revB.step" })).toBeVisible();
  await expect(source.getByText(/^4×3×0\.5 in · /)).toBeVisible();
  await expect(source.getByText("Holes: 2× Ø0.25")).toBeVisible();

  const bracket = card(page, /^BRK-1001/);
  await bracket.getByRole("button", { name: "Confirm" }).click();
  await expect(bracket.getByText("confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quote 1 confirmed part" }).click();
  await page.waitForURL(/\/quotes\/[^/]+$/);

  // The blank comes from the solid's box plus 1/8 in a side, rounded up to the 1/8 in.
  const line = card(page, /^BRK-1001/);
  await expect(field(line, "Blank")).toHaveValue("rect");
  await expect(field(line, "Length in")).toHaveValue("4.25");
  await expect(field(line, "Width in")).toHaveValue("3.25");
  await expect(field(line, "Thickness in")).toHaveValue("0.75");

  // Finish pricing by hand: one op, 30 min setup, 10 min a part.
  await line.getByRole("button", { name: "+ Operation" }).click();
  await field(line, "Op").fill("Op 10 mill");
  await field(line, "Setup min").fill("30");
  await field(line, "Cycle min/pc").fill("10");
  await line.getByRole("button", { name: "Save line" }).click();
  await expect(line.getByText("priced", { exact: true })).toBeVisible();
  const firstUnit =
    (await line.locator("table tbody tr").first().locator("td").nth(7).textContent()) ?? "";

  // Send, then email it to the RFQ's sender. Offline, the message is recorded, not delivered.
  await page.getByRole("button", { name: "Mark sent" }).click();
  const email = card(page, "Email to customer");
  await expect(field(email, "To (up to 5, separated by commas)")).toHaveValue(
    "dana.ortiz@example-robotics.test",
  );
  await expect(email.getByText("Email is not set up on this server")).toBeVisible();
  await email.getByRole("button", { name: "Send email" }).click();
  await expect(email.getByText("Recorded (not delivered: no mail provider).")).toBeVisible();
  const sentRow = email.locator("table tbody tr");
  await expect(sentRow).toHaveCount(1);
  await expect(sentRow).toContainText("dana.ortiz@example-robotics.test");
  await expect(sentRow).toContainText("E2E Estimator");
  await expect(sentRow).toContainText("not delivered");

  // Revise: a new draft with the same number; the first stays as sent until the revision goes out.
  const rev1Url = page.url();
  await page.getByRole("button", { name: "Revise" }).click();
  await page.waitForURL((u) => u.toString() !== rev1Url);
  await expect(page.getByRole("heading", { level: 1, name: /^Quote Q-\d+ Rev 2$/ })).toBeVisible();
  const changes = card(page, /^What changed from Q-\d+/);
  await expect(changes.getByText(/^Same lines and prices as Q-\d+/)).toBeVisible();

  // Cut the cycle time: the changes view shows the line, the operation and every price break.
  const rev2Line = card(page, /^BRK-1001/);
  await field(rev2Line, "Cycle min/pc").fill("8");
  await rev2Line.getByRole("button", { name: "Save line" }).click();
  await expect(changes.getByText(/^1 of 1 line changed\./)).toBeVisible();
  await expect(changes.getByRole("listitem").filter({ hasText: "Op 10 mill" })).toContainText(
    "setup 30 min, cycle 10 min/part → setup 30 min, cycle 8 min/part",
  );
  const priceRows = changes.locator("table tbody tr");
  await expect(priceRows).toHaveCount(3);
  await expect(priceRows.first().locator("td").nth(1)).toHaveText(firstUnit);
  // 2 min a part less at $95/h is $3.17 a part less (rounding can move the unit by a cent).
  await expect(priceRows.first().locator("td").nth(3)).toHaveText(/^−\$3\.1[6-8] \(-\d+\.\d%\)$/);

  // Print the customer-safe summary on the PDF, send the revision: it replaces the first.
  // A controlled box: it shows checked once the server saved it, so click rather than check().
  const printChanges = changes.getByLabel(/^Print “Changes from Q-\d+” on the customer PDF$/);
  await expect(printChanges).not.toBeChecked();
  await printChanges.click();
  await expect(printChanges).toBeChecked();
  await page.getByRole("button", { name: "Mark sent" }).click();
  const email2 = card(page, "Email to customer");
  await expect(email2.getByText(/^Changes from Q-\d+:$/)).toBeVisible();
  await page.goto(rev1Url);
  await expect(page.getByText("This quote was replaced by")).toBeVisible();
  await expect(page.getByText("superseded", { exact: true }).first()).toBeVisible();
});
