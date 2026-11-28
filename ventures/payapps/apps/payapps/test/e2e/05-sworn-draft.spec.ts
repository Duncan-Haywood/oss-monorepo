// The sworn statement's list of parties and what each was paid is saved with the job, not in one
// browser: typed on one computer, it is there on another (browser storage cleared here) and after
// "Clear" it is gone for both.
import { expect, test } from "@playwright/test";
import { addSovLines, createJob, signUpWithCompany } from "./helpers";

test("the sworn statement draft follows the job, not the browser", async ({ page }) => {
  await signUpWithCompany(page, { tag: "sworn", company: "Lakeside Electric LLC" });
  await createJob(page, {
    name: "Oak Park Library",
    number: "L-4",
    gc: "Prairie Builders",
    owner: "Village of Oak Park",
    contractSum: "48,000",
  });
  await addSovLines(page, [["1", "Electrical", "48,000"]]);
  const jobPath = new URL(page.url()).pathname;

  await page.goto(`${jobPath}/sworn-statement`);
  const name = page.getByRole("textbox", { name: "Name, row 1", exact: true });
  await name.fill("Valley Electric Supply");
  await expect(page.getByText(/^Saved with the job by E2E Subcontractor/)).toBeVisible();

  // Another computer: nothing in this browser's storage.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(name).toHaveValue("Valley Electric Supply");

  page.once("dialog", (d) => d.accept());
  const cleared = page.waitForResponse(
    (r) => r.url().endsWith("/sworn-statement/draft") && r.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  expect((await cleared).ok()).toBe(true);
  // The form starts again from the job (own forces), and that fresh start is what is saved.
  await expect(name).not.toHaveValue("Valley Electric Supply");
  await expect(page.getByText(/^Saved with the job by E2E Subcontractor/)).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(name).not.toHaveValue("Valley Electric Supply");
});
