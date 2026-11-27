// Mileage from a tracker app's export, in the browser: read the file, see the business drives listed
// and the others left out, fill the missing purposes in one go, save, and find the trips in the log.
// A second read marks every saved trip as already in the log.
import { expect, test } from "@playwright/test";
import { card, fixture, nav, signUpWithShop } from "./helpers";

test("a reseller imports business drives from a mileage tracker", async ({ page }) => {
  await signUpWithShop(page, { tag: "mileage-import", shop: "Estate Sale Finds" });
  await nav(page, "Mileage");
  const box = card(page, "Import trips from a mileage tracker");
  await box.getByLabel("Mileage CSV").setInputFiles(fixture("mileage-mileiq-style.csv"));
  await box.getByRole("button", { name: "Read trips" }).click();

  await expect(
    box.getByText(/3 business trips read from 7 rows; 3 ticked, 27\.7 miles/),
  ).toBeVisible();
  await expect(box.getByRole("button", { name: "3 ticked trips need a purpose" })).toBeDisabled();
  await box.getByText("4 rows left out").click();
  await expect(box.getByText("Line 4: Personal trip")).toBeVisible();

  // The post office run gets its own purpose; the two Goodwill legs share one.
  await box.getByLabel("Purpose for line 7").fill("Shipping: post office drop-off");
  await box.getByLabel("Purpose for the trips without one").fill("Sourcing: Goodwill Main St");
  await box.getByRole("button", { name: "Fill 2 empty" }).click();
  await box.getByRole("button", { name: "Save 3 trips" }).click();
  await expect(box.getByRole("status")).toContainText("Saved 3 trips, 27.7 miles");

  await expect(page.getByText(/3 trips, 27\.7\s+business miles/)).toBeVisible();
  await expect(page.getByRole("row", { name: /Shipping: post office drop-off/ })).toContainText(
    "3.2",
  );

  await box.getByRole("button", { name: "Read trips" }).click();
  await expect(box.getByText(/3 business trips read from 7 rows; 0 ticked/)).toBeVisible();
  await expect(box.getByText("Already in your log.")).toHaveCount(3);
});
