import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { taxPack } from "./taxpack.mjs";

const CSV = `Date,Description,Amount
2026-01-05,CLIENT PAYMENT ACME,5000.00
2026-01-07,FACEBK ADS,-200.00
2026-02-01,FREELANCER JOE,-2500.00
`;
function books() {
  let { books: b } = importStatement(newBooks(), CSV, "1000");
  const id = (s) => b.transactions.find((t) => t.desc.includes(s)).id;
  return confirm(b, { [id("ACME")]: "4000", [id("FACEBK")]: "6000", [id("JOE")]: "6020" });
}

test("the pack carries the year's worksheets and says what it left out", () => {
  const p = taxPack(books(), 2026);
  for (const f of ["trial_balance.csv", "profit_and_loss.csv", "balance_sheet.csv", "journal.csv", "schedule_c.csv", "contractors_1099.csv", "1099_nec_filing.csv", "close_checks.txt", "INDEX.txt"]) assert.ok(f in p.files, f);
  assert.match(p.files["profit_and_loss.csv"], /Net profit,,?.*2300\.00/);
  assert.match(p.files["schedule_c.csv"], /31,Net profit or \(loss\),,2300\.00/);
  assert.ok(p.notes.some((n) => /no W-9/.test(n)));
  assert.ok(p.skipped.some((s) => s.file === "payroll_worksheets.csv"));
  assert.match(p.files["INDEX.txt"], /LEFT OUT/);
});
test("a bad year is refused", () => assert.throws(() => taxPack(newBooks(), "abc")));
