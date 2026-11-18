import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Found by eval/bank2ynab-preamble-probe.mjs: with a ; delimiter, decimal commas
// ("4,50") and two or more totals footers ("Total debits;1,000.00") each split
// into 2 fields on the comma, which outvoted the 4-field table and read 0 rows.
test("semicolon file with decimal commas and several footer lines still reads", () => {
  const r = readStatement([
    "Date;Description;Debit;Credit",
    "13.03.2026;COFFEE;4,50;",
    "14.03.2026;PAY;;1200,00",
    "15.03.2026;RENT;950,00;",
    "Total debits;1,000.00",
    "Total credits;2,000.00",
    "Closing balance;5000.00",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-13", -450], ["2026-03-14", 120000], ["2026-03-15", -95000]]);
});
