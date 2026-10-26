// Swept OCA/bank-statement-import's CSV and QIF fixtures (AGPL, cloned at run time,
// nothing copied; rows made up in the same layouts). Two faults, fixed in `bank.mjs`:
// a `D/C` flag column was not a debit/credit marker, so its rows kept the file's own
// (inconsistent) amount signs; a `Label` column was not a description alias, so a
// Label + Detail file took the Detail text and lost the bank's label.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("a D/C flag column signs an amount whatever sign the file wrote", () => {
  const csv = `"Date","Label","Amount","D/C","Balance"\n"12/15/2018","Supplier","33.50","D","-23.50"\n"12/16/2018","Payment","-1,533.50","C","1,510.00"\n`;
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-3350, 153350]);
  assert.deepEqual(r.problems, []);
});

test("a C/D flag column works too", () => {
  const r = readStatement(`Date,Description,Amount,C/D\n2026-03-01,Rent,900.00,D\n2026-03-02,Deposit,50.00,C\n`);
  assert.deepEqual(r.rows.map((x) => x.cents), [-90000, 5000]);
});

test("Label is the description when a Detail column sits beside it", () => {
  const csv = `Date,Operation Number,Label,Debit,Credit,Detail\n01/04/20,OP 1,LABEL 1,"-50,00",,DETAILS 1\n02/04/20,OP 2,LABEL 2,,"1300,00",DETAILS 2\n`;
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.desc), ["LABEL 1", "LABEL 2"]);
});
