// A new subcontractor's first pay application, the path the free guides send people down: sign up,
// add a job and its schedule of values, bill the month, submit, download the PDF and CSV, and record
// the GC's check. Every figure is checked against the arithmetic a person would do by hand.
import { expect, test } from "@playwright/test";
import { addSovLines, createJob, signUpWithCompany } from "./helpers";

test("sign-up to a submitted, paid first pay application", async ({ page }) => {
  await signUpWithCompany(page, { tag: "first", company: "Dana Drywall LLC" });
  await expect(page.getByRole("region", { name: "Getting started" })).toContainText("0 of 5 done");

  await createJob(page, {
    name: "Riverside Clinic TI",
    number: "2611",
    gc: "Summit Builders",
    owner: "Riverside Health",
    contractSum: "250,000",
  });
  await expect(
    page.getByText("GC: Summit Builders · Contract $250,000.00 · Retainage 10%"),
  ).toBeVisible();

  await addSovLines(page, [
    ["1", "Framing", "100,000"],
    ["2", "Drywall", "120,000"],
    ["3", "Taping and finish", "30,000"],
  ]);
  // The lines match the contract sum, so the mismatch notice is gone and the next item number is 4.
  await expect(page.getByRole("row", { name: "Total $250,000.00 $250,000.00" })).toBeVisible();
  await expect(page.getByText(/^Lines total/)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Item", exact: true })).toHaveValue("4");

  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Pay application #1 draft" }),
  ).toBeVisible();

  // $40,000 of framing and $12,000 of drywall in place, $5,000 of board stored on site.
  await page.getByRole("textbox", { name: "Work this period, item 1" }).fill("40,000");
  await page.getByRole("textbox", { name: "Work this period, item 2" }).fill("12,000");
  await page.getByRole("textbox", { name: "Stored materials, item 2" }).fill("5,000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();

  // By hand: G = 40,000 + 12,000 + 5,000 = 57,000; 10% retainage on 52,000 of work and 5,000 stored;
  // due = 57,000 - 5,700 = 51,300; balance to finish with retainage = 250,000 - 57,000 + 5,700.
  const row = (name: string) => page.getByRole("row", { name, exact: true });
  await expect(
    row("Totals $250,000.00 $0.00 $52,000.00 $5,000.00 $57,000.00 $193,000.00 $5,700.00"),
  ).toBeVisible();
  await expect(row("4 Total completed and stored to date $57,000.00")).toBeVisible();
  await expect(row("5a Retainage on completed work (10%) $5,200.00")).toBeVisible();
  await expect(row("5b Retainage on stored materials (10%) $500.00")).toBeVisible();
  await expect(row("8 Current payment due $51,300.00")).toBeVisible();
  await expect(row("9 Balance to finish, including retainage $198,700.00")).toBeVisible();

  // The PDF and the continuation CSV download from the draft.
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "PDF", exact: true }).click(),
  ]);
  const pdfBytes = await streamBytes(await pdf.createReadStream());
  expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);

  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Continuation CSV", exact: true }).click(),
  ]);
  const csvText = (await streamBytes(await csv.createReadStream())).toString("utf8");
  expect(csvText).toContain("2,Drywall,120000,0,12000,5000,17000,14.17,103000,1700,0");
  expect(csvText).toContain(",TOTALS,250000,0,52000,5000,57000,22.8,193000,5700,");

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #1 submitted/ }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Period to" })).toBeDisabled();

  // The GC pays $50,000 against $51,300: the balance stays owed and the application stays open.
  const payments = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Payments received", level: 2 }),
  });
  await expect(payments).toContainText(
    "Expected $51,300.00 (line 8) · received $0.00 · still owed $51,300.00",
  );
  await payments.getByRole("textbox", { name: "Amount ($)" }).fill("50,000");
  await payments.getByRole("textbox", { name: "Check # or reference" }).fill("1042");
  await payments.getByRole("button", { name: "Record payment" }).click();
  await expect(payments).toContainText("received $50,000.00 · still owed $1,300.00");
  await expect(payments.getByRole("row", { name: /1042 \$50,000\.00/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #1 submitted/ }),
  ).toBeVisible();

  // The cash report ages the $1,300 still owed on this job.
  await page.getByRole("link", { name: "← Riverside Clinic TI" }).click();
  await page.getByRole("link", { name: "← Projects" }).click();
  await page.getByRole("link", { name: "Cash and retainage" }).click();
  await expect(page.getByRole("main")).toContainText("Riverside Clinic TI");
  await expect(page.getByRole("main")).toContainText("$1,300.00");

  // The rest comes in (a blank amount records the full balance) and the application is paid.
  await page.goBack();
  await page.getByRole("link", { name: /Riverside Clinic TI/ }).click();
  await page.getByRole("link", { name: "#1", exact: true }).click();
  await payments.getByRole("textbox", { name: "Check # or reference" }).fill("1077");
  await payments.getByRole("button", { name: "Record payment" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #1 paid/ }),
  ).toBeVisible();
  await expect(payments).toContainText("received $51,300.00 · still owed $0.00");

  // Back on the company page, the five core steps are done, so the getting-started list is gone.
  await page.getByRole("link", { name: "← Riverside Clinic TI" }).click();
  await page.getByRole("link", { name: "← Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);

  // Coming back to the home page, the company is listed and the form reads as a second company.
  await page.getByRole("link", { name: "PayApps", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dana Drywall LLC" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add another company", level: 2 })).toBeVisible();
});

async function streamBytes(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
