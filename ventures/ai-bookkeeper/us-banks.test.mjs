// Six US bank and card layouts, pinned. Rows are made up and headers are from
// memory of each bank's layout; no real download was tried (README, "US bank layouts").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const cases = [
  ["usbank-checking.csv", "us-bank", [320000, -8999, -6026]],
  ["navyfed-checking.csv", "navy-federal", [320000, -8999]],
  ["citi-status-card.csv", "citi", [-6026, 50000]],
  ["truist-checking.csv", "truist", [320000, -8999]],
  ["td-us-checking.csv", "td-bank", [320000, -8999]],
  ["bofa-checking-summary.csv", "bank-of-america", [320000, -8999, -6026, -100000]],
];
for (const [file, bank, cents] of cases) {
  test(`${file}: signs, amounts and no problems`, () => {
    const r = read(file);
    assert.equal(r.bank, bank);
    assert.deepEqual(r.rows.map((x) => x.cents), cents);
    assert.deepEqual(r.problems, []);
  });
}
test("balance chains hold where the file has a Balance column", () => {
  for (const f of ["navyfed-checking.csv", "truist-checking.csv", "td-us-checking.csv", "bofa-checking-summary.csv"]) {
    const c = checkRunningBalance(read(f).rows);
    assert.equal(c.checked, true, f);
    assert.deepEqual(c.breaks, [], f);
  }
});
test("Bank of America: the summary block above the header is skipped", () => {
  assert.equal(read("bofa-checking-summary.csv").rows[0].date, "2026-10-02");
});
