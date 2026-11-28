// The RFQ review reads the part's tolerance text and, when the tightest one is tighter than standard
// machining (±.005 in), says how tight and what to check before pricing (shared/tolerance.ts). It
// follows the estimator's edits and changes no price. The quote line repeats it beside the operations.
import { expect, test } from "@playwright/test";
import { card, field, RFQ_EMAIL, signUpWithShop } from "./helpers";

test("the RFQ review flags a tight tolerance and follows edits", async ({ page }) => {
  await signUpWithShop(page, { tag: "toler", shop: "E2E Tolerance Shop" });
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ - tolerance check");
  await field(newRfq, "Paste the RFQ email").fill(RFQ_EMAIL);
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);

  const bracket = card(page, /^BRK-1001/);
  const tolerances = field(bracket, "Tolerances");
  // The fixture's "+/- .005 unless noted" is standard: no note.
  await expect(tolerances).toHaveValue("+/- .005 unless noted");
  const check = bracket.getByTestId("tolerance-check");
  await expect(check).toHaveCount(0);

  await tolerances.fill("+/- .005 unless noted, bore +.0005/-.0000");
  await expect(check).toContainText("Precision");
  await expect(check).toContainText(
    "+.0005/-.0000, a 0.00050 in (0.013 mm) zone (tightest of 2 read).",
  );
  await expect(check).toContainText("confirm the shop can hold and measure it");

  await tolerances.fill("ISO 2768-f");
  await expect(check).toContainText("Close");
  await expect(check).toContainText("for a 6-30 mm feature (ISO 2768-1)");

  await tolerances.fill("");
  await expect(check).toHaveCount(0);

  // Part 2: a fit read at the size the callout gives, and limits written as two sizes.
  await tolerances.fill("+/- .005 unless noted, bore Ø40 H7");
  await expect(check).toContainText("Ø40 H7, a 0.00098 in (0.025 mm) zone, IT7 for 30-50 mm");
  await tolerances.fill("+/- .005 unless noted, bore .4995/.5000");
  await expect(check).toContainText(".4995/.5000, a 0.00050 in (0.013 mm) zone");

  // The quote line shows the same note beside the operations, where the cycle times are set.
  await bracket.getByRole("button", { name: "Confirm" }).click();
  await expect(bracket.getByText("confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Quote \d+ confirmed parts?$/ }).click();
  await page.waitForURL(/\/quotes\/[^/]+$/);
  const line = card(page, /^BRK-1001/);
  const lineCheck = line.getByTestId("tolerance-check");
  await expect(lineCheck).toContainText("Precision");
  await expect(lineCheck).toContainText(
    "Part tolerance: .4995/.5000, a 0.00050 in (0.013 mm) zone (tightest of 2 read).",
  );
});
