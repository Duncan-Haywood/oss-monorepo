// Expenses from a card statement, in the browser: read the file, see which lines start ticked and why
// the others do not, change one line's choice, save, and find the rows in the expense list. A second
// read of the same file marks every saved line as already in the books. A merchant unticked with
// "Remember" starts unticked on the next read, until "Forget".
import { expect, test } from "@playwright/test";
import { card, fixture, nav, signUpWithShop } from "./helpers";

test("a reseller imports expenses from a card statement", async ({ page }) => {
  await signUpWithShop(page, { tag: "statement", shop: "Bin Diver Resale" });
  await nav(page, "Expenses");
  const box = card(page, "Import from a bank or card statement");
  await box.getByLabel("Statement CSV").setInputFiles(fixture("statement-chase-card.csv"));
  await box.getByRole("button", { name: "Read statement" }).click();

  await expect(box.getByText(/10 purchases read from 12 rows; 5 ticked/)).toBeVisible();
  await expect(box.getByRole("row", { name: /GOODWILL/ })).toContainText("Looks like inventory");
  await expect(box.getByRole("checkbox", { name: "Save GOODWILL #112" })).not.toBeChecked();
  await expect(box.getByRole("row", { name: /SHELL OIL/ })).toContainText("standard mileage rate");

  // The Amazon order was packing tape: tick it as supplies.
  await box.getByRole("checkbox", { name: /Save AMZN/ }).check();
  await expect(box.getByLabel(/Category for AMZN/)).toHaveValue("supplies");
  await box.getByRole("button", { name: "Save 6 expenses" }).click();
  await expect(box.getByRole("status")).toContainText("Saved 6 expenses totalling $173.33");

  const list = page
    .locator("section.card")
    .filter({ has: page.getByRole("columnheader", { name: "Vendor" }) })
    .last();
  await expect(list.getByRole("row", { name: /ULINE/ })).toContainText("$86.15");
  await expect(list.getByRole("row", { name: /USPS/ })).toHaveCount(3);

  await box.getByRole("button", { name: "Read statement" }).click();
  await expect(box.getByText(/10 purchases read from 12 rows; 0 ticked/)).toBeVisible();
  await expect(box.getByText("Already in your books.")).toHaveCount(6);
});

test("a merchant left out once starts unticked on the next statement, until forgotten", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "statement-left-out", shop: "Thrift Flip Co" });
  await nav(page, "Expenses");
  const box = card(page, "Import from a bank or card statement");
  await box.getByLabel("Statement CSV").setInputFiles(fixture("statement-chase-card.csv"));
  await box.getByRole("button", { name: "Read statement" }).click();
  await expect(box.getByText(/10 purchases read from 12 rows; 5 ticked/)).toBeVisible();

  // Vendoo was a personal subscription on the business card: untick it and keep "Remember" ticked.
  await box.getByRole("checkbox", { name: "Save PAYPAL *VENDOO" }).uncheck();
  await expect(box.getByRole("checkbox", { name: /Remember the line I unticked/ })).toBeChecked();
  await box.getByRole("button", { name: "Save 4 expenses" }).click();
  await expect(box.getByRole("status")).toContainText(
    "1 merchant you left out will start unticked next time",
  );

  await box.getByRole("button", { name: "Read statement" }).click();
  await expect(box.getByText(/10 purchases read from 12 rows; 0 ticked/)).toBeVisible();
  await expect(box.getByRole("row", { name: /VENDOO/ })).toContainText(
    "You left out an earlier charge from VENDOO",
  );
  await expect(box.getByRole("checkbox", { name: "Save PAYPAL *VENDOO" })).not.toBeChecked();

  await box.getByText("1 merchant starts unticked because you left it out").click();
  await box.getByRole("button", { name: "Forget VENDOO" }).click();
  await expect(box.getByText(/merchant starts unticked/)).toHaveCount(0);
  await box.getByRole("button", { name: "Read statement" }).click();
  await expect(box.getByRole("checkbox", { name: "Save PAYPAL *VENDOO" })).toBeChecked();
});
