// Schedule C line 35 from last year's return, in the browser: the seller types in the line 41 they filed
// for the year before, Part III uses it with the books' own count in the note, the page warns about the
// difference, the figure is still there after a reload, and Remove puts line 35 back to the books.
import { expect, test } from "@playwright/test";
import { card, labelled, nav, signUpWithShop } from "./helpers";

test("last year's filed line 41 becomes line 35, with a warning when the books differ", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "opening", shop: "Attic Finds" });
  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");

  const part3 = card(page, "Part III: cost of goods sold (inventory at cost)");
  const row35 = part3.getByRole("row", { name: /Inventory at beginning of year/ });
  await expect(row35).toContainText("$0.00");

  const form = page.getByTestId("filed-opening");
  await expect(form).toContainText("Your books show $0.00 on hand at December 31, 2025");
  await labelled(form, "Line 41 on your 2025 return ($)").fill("$1,250.00");
  await form.getByRole("button", { name: "Save" }).click();

  await expect(row35).toContainText("$1,250.00");
  await expect(row35).toContainText("Line 41 of your 2025 return, as you entered it.");
  await expect(page.getByText(/\$1250\.00 more on the return/)).toBeVisible();

  await page.reload();
  await labelled(page, "Tax year").fill("2026");
  await expect(labelled(form, "Line 41 on your 2025 return ($)")).toHaveValue("1250.00");

  await form.getByRole("button", { name: "Remove" }).click();
  await expect(row35).toContainText("$0.00");
  await expect(row35).not.toContainText("as you entered it");
});
