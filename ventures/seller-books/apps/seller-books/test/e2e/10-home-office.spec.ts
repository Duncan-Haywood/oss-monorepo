// Schedule C line 30 by the simplified method, in the browser: the seller enters the space and the months,
// the worksheet's line 30 shows the arithmetic (held to line 29 with the reason when the year's profit is
// smaller), the entry is still there after a reload, and Remove puts the line back to "Not entered".
import { expect, test } from "@playwright/test";
import { card, labelled, nav, signUpWithShop } from "./helpers";

test("a home office saved for the year fills line 30 and line 31", async ({ page }) => {
  await signUpWithShop(page, { tag: "home", shop: "Garage Resale" });
  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");

  const lines = card(page, "Parts I and II: income and expenses");
  await expect(lines.getByRole("row", { name: /Business use of home/ })).toContainText(
    "Not entered",
  );

  const ho = page.getByTestId("home-office");
  await labelled(ho, "Business area (sq ft)").fill("120");
  await labelled(ho, "Whole home (sq ft, optional)").fill("1400");
  // Used from July: untick January to June.
  for (const m of ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]) {
    await ho.getByRole("checkbox", { name: m, exact: true }).uncheck();
  }
  await ho.getByRole("button", { name: "Save for 2026" }).click();

  const row30 = lines.getByRole("row", { name: /Business use of home \(simplified method\)/ });
  await expect(row30).toContainText("120 sq ft × $5 × 6/12 months");
  await expect(row30).toContainText("(a) home 1400 sq ft, (b) business 120 sq ft");
  // A new shop has no profit, so the $300.00 is held to line 29 and the page says so.
  await expect(row30).toContainText("$0.00");
  await expect(page.getByText(/limited to line 29: \$300\.00/)).toBeVisible();
  await expect(lines.getByRole("row", { name: /Net profit or \(loss\)/ })).toBeVisible();

  await page.reload();
  await labelled(page, "Tax year").fill("2026");
  await expect(labelled(ho, "Business area (sq ft)")).toHaveValue("120");
  await expect(ho.getByRole("checkbox", { name: "Jun", exact: true })).not.toBeChecked();
  await expect(ho.getByRole("checkbox", { name: "Jul", exact: true })).toBeChecked();

  await ho.getByRole("button", { name: "Remove" }).click();
  await expect(lines.getByRole("row", { name: /Business use of home/ })).toContainText(
    "Not entered",
  );
});
