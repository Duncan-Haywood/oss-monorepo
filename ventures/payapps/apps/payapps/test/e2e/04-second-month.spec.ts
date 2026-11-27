// The second month, the one every subcontractor bills after the first: pay app #1 is paid, an
// approved change order adds a line, and pay app #2 must carry the work billed before (column D),
// the change order (line 2), the board stored last month now installed, and "less previous
// certificates" (line 7). Every figure is checked against the arithmetic a person would do by hand.
import { expect, type Page, test } from "@playwright/test";
import { addSovLines, box, createJob, signUpWithCompany } from "./helpers";

const row = (page: Page, name: string) => page.getByRole("row", { name, exact: true });

test("second pay application carries the first, a change order and stored materials", async ({
  page,
}) => {
  // Approve asks for the approval date in a prompt; take its default (today).
  page.on("dialog", (d) => d.accept(d.defaultValue()));
  await signUpWithCompany(page, { tag: "month2", company: "Kestrel Framing Co" });
  await createJob(page, {
    name: "Elm Street Library",
    number: "2702",
    gc: "Northgate Construction",
    owner: "City of Elm",
    contractSum: "100,000",
  });
  await addSovLines(page, [
    ["1", "Metal stud framing", "60,000"],
    ["2", "Drywall", "40,000"],
  ]);

  // Month 1: $30,000 of framing, $5,000 of board stored on site.
  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await page.getByRole("textbox", { name: "Work this period, item 1" }).fill("30,000");
  await page.getByRole("textbox", { name: "Stored materials, item 2" }).fill("5,000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();
  // G = 35,000; retainage 3,500; due 31,500.
  await expect(row(page, "8 Current payment due $31,500.00")).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #1 submitted/ }),
  ).toBeVisible();
  // The GC pays it in full (a blank amount records the whole balance).
  const payments = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Payments received", level: 2 }),
  });
  await payments.getByRole("textbox", { name: "Check # or reference" }).fill("5510");
  await payments.getByRole("button", { name: "Record payment" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #1 paid/ }),
  ).toBeVisible();

  // Between the two: CO 1 adds an $8,000 soffit line, and the GC signs it today, the day pay app
  // #1's period ended. The true date is kept; it bills from the next application, so #1 (already
  // sent) never changes.
  await page.getByRole("link", { name: "← Elm Street Library" }).click();
  const cos = page.locator("#change-orders");
  await cos.getByRole("textbox", { name: "CO #" }).fill("1");
  await cos.getByRole("textbox", { name: "Description", exact: true }).fill("Soffit framing");
  await cos.getByRole("combobox", { name: "Line adjusted" }).selectOption("new");
  await cos.getByRole("textbox", { name: "Item", exact: true }).fill("3");
  await cos.getByRole("textbox", { name: "Amount ($)" }).fill("8,000");
  await cos.getByRole("button", { name: "Add change order" }).click();
  await expect(cos.getByRole("cell", { name: "$8,000.00", exact: true })).toBeVisible();
  await cos.getByRole("button", { name: "Approve" }).click();
  await expect(cos).toContainText(/approved \d{4}-\d{2}-\d{2}/);
  await expect(cos).toContainText(/bills from \d{4}-\d{2}-\d{2}, after the submitted period/);

  // Month 2 opens with what came before.
  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Pay application #2 draft" }),
  ).toBeVisible();
  await expect(row(page, "1 Original contract sum $100,000.00")).toBeVisible();
  await expect(row(page, "2 Net change by change orders $8,000.00")).toBeVisible();
  await expect(row(page, "3 Contract sum to date $108,000.00")).toBeVisible();
  await expect(row(page, "7 Less previous certificates for payment $31,500.00")).toBeVisible();

  // $15,000 more framing, the stored board hung ($5,000 moves from F into E), $4,000 of soffits.
  await page.getByRole("textbox", { name: "Work this period, item 1" }).fill("15,000");
  await page.getByRole("textbox", { name: "Work this period, item 2" }).fill("5,000");
  await page.getByRole("textbox", { name: "Stored materials, item 2" }).fill("0");
  await page.getByRole("textbox", { name: "Work this period, item 3" }).fill("4,000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();

  // By hand: D = 30,000 (work only; F is "presently stored, not in D or E"); E = 24,000; F = 0;
  // G = 54,000; H = 108,000 - 54,000 = 54,000; retainage 5,400; earned less retainage 48,600;
  // due = 48,600 - 31,500 = 17,100; balance to finish with retainage = 54,000 + 5,400.
  await expect(
    row(page, "Totals $108,000.00 $30,000.00 $24,000.00 $0.00 $54,000.00 $54,000.00 $5,400.00"),
  ).toBeVisible();
  await expect(row(page, "4 Total completed and stored to date $54,000.00")).toBeVisible();
  await expect(row(page, "5 Total retainage $5,400.00")).toBeVisible();
  await expect(row(page, "6 Total earned less retainage $48,600.00")).toBeVisible();
  await expect(row(page, "8 Current payment due $17,100.00")).toBeVisible();
  await expect(row(page, "9 Balance to finish, including retainage $59,400.00")).toBeVisible();

  // The change order's line bills at its own scheduled value: $4,000 of $8,000 is 50%.
  const soffit = page.getByRole("row", { name: /^3 Soffit framing/ });
  await expect(soffit).toContainText("$8,000.00");
  await expect(soffit).toContainText("50");

  // The continuation CSV says the same.
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Continuation CSV", exact: true }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const c of await csv.createReadStream()) chunks.push(Buffer.from(c as Buffer));
  const csvText = Buffer.concat(chunks).toString("utf8");
  expect(csvText).toContain("1,Metal stud framing,60000,30000,15000,0,45000,75,15000,4500,0");
  expect(csvText).toContain(",TOTALS,108000,30000,24000,0,54000,");

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Pay application #2 submitted/ }),
  ).toBeVisible();
  await expect(box(page, "Period to")).toBeDisabled();
});
