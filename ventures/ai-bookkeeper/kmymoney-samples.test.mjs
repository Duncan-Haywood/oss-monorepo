// Two faults found by reading KMyMoney's sample files (GPL, cloned at run time,
// nothing copied): a "Transactions" description header, and a QIF whose only
// dates are unambiguous day-first ones. Rows below are made up in their shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, readQif } from "./bank.mjs";

test("a 'Transactions' column is the description", () => {
  const csv = 'Account name: ,MyAccount_****01233,,,,\nAccount balance: ,63.86,,,,\nDate,Transactions,Debits,Credits,Balance\n\n04 Nov 2009,"Direct Debit",18.75,,902.74\n06 Nov 2009,"Personal Cheque",10.00,,892.74\n';
  const r = readStatement(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].desc, "Direct Debit");
  assert.equal(r.rows[0].cents, -1875);
});

test("a QIF with a 30/12/2025 date reads day first without being told", () => {
  const q = "!Type:Bank\nD30/12/2025\nT100.00\nPTest\n^\nD02/01/2026\nT-5.00\nPB\n^\n";
  const r = readStatement(q);
  assert.deepEqual(r.rows.map((x) => x.date), ["2025-12-30", "2026-01-02"]);
  assert.equal(r.problems.length, 0);
});

test("a QIF with month-first evidence, or an explicit dayFirst, is unchanged", () => {
  assert.equal(readQif("!Type:Bank\nD12/30/2025\nT1.00\n^\n").rows[0].date, "2025-12-30");
  assert.equal(readQif("!Type:Bank\nD03/04/2025\nT1.00\n^\n").rows[0].date, "2025-03-04");
  assert.equal(readQif("!Type:Bank\nD03/04/2025\nT1.00\n^\n", { dayFirst: true }).rows[0].date, "2025-04-03");
});
