import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Exports that put the currency code after the column name ("Amount USD").
for (const head of ["Amount USD", "Amount EUR", "Amount (USD)", "Amount [GBP]"]) {
  test(`header "${head}" is the amount column`, () => {
    const r = readStatement(`Date,Payee,${head}\n2026-01-15,Coffee,$-12.50\n2026-01-16,Refund,"$1,200.00"\n`);
    assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 120000]);
    assert.deepEqual(r.problems, []);
  });
}

test("currency-suffixed debit, credit and balance columns", () => {
  const r = readStatement(`Date,Description,Debit CAD,Credit CAD,Balance CAD\n2026-01-15,Coffee,12.50,,100.00\n2026-01-16,Refund,,20.00,120.00\n`);
  assert.deepEqual(r.rows.map((x) => [x.cents, x.balance]), [[-1250, 10000], [2000, 12000]]);
});
