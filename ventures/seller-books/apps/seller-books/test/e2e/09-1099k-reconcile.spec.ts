// A Poshmark 1099-K checked against the books in the browser: the fixture's four sold lines come to $100.00
// of item sales in January 2026 (test/worker/reconcile-1099k.test.ts holds the API to the P&L's figure), so
// a form for $100.00 matches, and a form that also shows $40.00 in March names March as not imported.
import { expect, test } from "@playwright/test";
import { card, importReport, labelled, nav, signUpWithShop } from "./helpers";

test("a seller checks a 1099-K against the books", async ({ page }) => {
  await signUpWithShop(page, { tag: "1099k", shop: "Posh Closet" });
  await importReport(page, "Poshmark: My Sales Report", "poshmark-my-sales-report.csv");
  await nav(page, "1099-K notes");

  const rec = card(page, "Check a 1099-K against your books");
  await labelled(rec, "Tax year").fill("2026");
  await labelled(rec, "Platform").selectOption({ label: "Poshmark" });
  await labelled(rec, "Box 1a gross amount ($)").fill("100.00");
  await rec.getByRole("button", { name: "Compare" }).click();
  await expect(rec.getByRole("row", { name: /^Item sales \(matches\)/ })).toContainText("$100.00");
  await expect(rec.getByTestId("reconcile-findings")).toContainText("within $1.00 of box 1a");

  await labelled(rec, "Box 1a gross amount ($)").fill("140.00");
  await rec.getByText("Boxes 5a-5l, by month (optional)").click();
  await rec.getByLabel("Box 5 Jan").fill("100");
  await rec.getByLabel("Box 5 Mar").fill("40");
  await rec.getByRole("button", { name: "Compare" }).click();
  const findings = rec.getByTestId("reconcile-findings");
  await expect(findings).toContainText("The form shows $40.00 more");
  await expect(findings).toContainText("March: the form shows $40.00");
  await expect(rec.getByRole("row", { name: /^Mar/ })).toContainText("$40.00");
});
