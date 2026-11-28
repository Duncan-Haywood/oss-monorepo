// Each sworn statement PDF an editor downloads is kept with the job as given with its pay
// application, listed to print again, and next month's statement is checked against it: here, paid
// to date going down for a party is flagged before the second PDF goes out.
import { expect, test } from "@playwright/test";
import { addSovLines, createJob, signUpWithCompany } from "./helpers";

test("a downloaded sworn statement is kept and next month's is checked against it", async ({
  page,
}) => {
  await signUpWithCompany(page, { tag: "swgiven", company: "Lakeside Electric LLC" });
  await createJob(page, {
    name: "Oak Park Library",
    number: "L-5",
    gc: "Prairie Builders",
    owner: "Village of Oak Park",
    contractSum: "48,000",
  });
  await addSovLines(page, [["1", "Electrical", "48,000"]]);
  const jobPath = new URL(page.url()).pathname;

  await page.goto(`${jobPath}/sworn-statement`);
  await expect(page.getByText(/^None yet\. The first PDF an editor downloads/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Name, row 1", exact: true })
    .fill("Valley Electric Supply");
  await page.getByRole("textbox", { name: "Pay application", exact: true }).fill("No. 1");
  await page.getByRole("textbox", { name: "Already paid, row 1", exact: true }).fill("1,000");

  const kept = page.waitForResponse(
    (r) => r.url().endsWith("/sworn-statements") && r.request().method() === "POST",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^sworn-statement-pay-app-1-/);
  expect((await kept).status()).toBe(201);
  const given = page.getByRole("row").filter({ hasText: "No. 1" });
  await expect(given).toContainText("$1,000.00");
  await expect(given.getByRole("link", { name: "PDF" })).toBeVisible();

  // Next month: a new pay application, and paid to date typed lower by mistake.
  await page.getByRole("textbox", { name: "Pay application", exact: true }).fill("No. 2");
  await page.getByRole("textbox", { name: "Already paid, row 1", exact: true }).fill("500");
  await expect(page.getByText(/^Against the statement given .* \(No\. 1\)$/)).toBeVisible();
  await expect(
    page.getByText(/Already paid is \$500\.00, less than the \$1,000\.00 on the statement given/),
  ).toBeVisible();
  // Fixed: the warning goes.
  await page.getByRole("textbox", { name: "Already paid, row 1", exact: true }).fill("1,500");
  await expect(page.getByText(/^Against the statement given/)).toHaveCount(0);
});
