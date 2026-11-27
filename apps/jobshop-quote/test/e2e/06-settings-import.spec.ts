// Shop settings from a spreadsheet: a price list that keeps its markups and line minimum in a block
// above the machine table is pasted once as "Shop settings", previewed with each change, saved, and
// the settings form shows the new values (it must not keep, and save back, the ones it opened with).
import { expect, test } from "@playwright/test";
import { card, field, signUpWithShop } from "./helpers";

test("shop settings import from the block above a rate table", async ({ page }) => {
  await signUpWithShop(page, { tag: "settings", shop: "E2E Settings Shop" });
  const settings = card(page, "Shop and pricing rules");
  const importCard = card(page, "Import from a spreadsheet");
  await importCard.getByRole("button", { name: "Import…" }).click();
  await field(importCard, "What the sheet holds").selectOption("settings");
  await field(importCard, "…or paste the rows, header included, from Excel or Google Sheets").fill(
    [
      "Price list 2026\t\t",
      "Labor markup\t27%\t",
      "Minimum line charge\t$210\t",
      "Markup\t5%\t",
      "Default quantities\t1; 10; 100\t",
      "\t\t",
      "Machine\tKind\tHourly rate",
      "Haas VF-2\t3-axis mill\t$95",
    ].join("\n"),
  );
  const plan = importCard.locator("table tbody tr");
  await expect(plan).toHaveCount(3);
  await expect(plan.nth(0)).toContainText("Labor markup");
  await expect(plan.nth(0)).toContainText("→ 27%");
  await expect(plan.nth(1)).toContainText("→ $210.00");
  await expect(importCard.getByText(/"Markup" left out: does not say which markup/)).toBeVisible();
  await importCard.getByRole("button", { name: "Save 3 rows" }).click();
  await expect(importCard.getByText(/^Saved: \d settings? changed/)).toBeVisible();

  await expect(field(settings, "Labor markup %")).toHaveValue("27");
  await expect(field(settings, "Line minimum $")).toHaveValue(/^210(\.00)?$/);
  await expect(field(settings, "Default quantity breaks")).toHaveValue("1, 10, 100");
  // The machine table under the block is not a setting and was not imported as one.
  await expect(
    card(page, "Machines and work centers").getByRole("cell", { name: "Haas VF-2" }),
  ).toHaveCount(0);
});
