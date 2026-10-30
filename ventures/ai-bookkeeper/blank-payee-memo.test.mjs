// YNAB register export shape (seen in we-promise/sure's test/fixtures/files/imports/ynab.csv, AGPL, read at run time, nothing copied; rows here are made up): a reconciliation adjustment has no payee, only a memo.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const csv = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","01/01/2024","Landlord","Housing: Rent","Housing","Rent","January rent","$1,500.00","$0.00","Cleared"
"Checking","","01/04/2024","","","","","Reconciliation balance adjustment","$0.00","$0.43","Reconciled"
`;

test("a row with no payee takes its memo as the description", () => {
  const { rows } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.desc), ["Landlord", "Reconciliation balance adjustment"]);
  assert.deepEqual(rows.map((r) => r.cents), [-150000, 43]);
});
