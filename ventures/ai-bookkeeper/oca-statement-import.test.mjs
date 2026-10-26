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

// The OCA xlsx/xls fixtures (swept 2026-10-26 through xlsx.mjs/xls.mjs; no fault) come out
// as these text shapes. Rows are made up in the same layouts.
test("Excel text-marker apostrophes, currency words and symbols, and a TOTAL row", () => {
  const csv = `REF,DESCRIPTION,DEBIT,CREDIT,BALANCE,DATE\n84 1,TRANS A,"'579,68 USD", ,"'USD 9.126,07",2024-03-07\n84 2,TRANS B,"'544,00 $", ,"'8.582,07 $",2024-03-07\n84 3,TRANS C,1084, ,"7.498,07",2024-03-07\n,TOTAL,2207.68,0,,\n`;
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-57968, -54400, -108400]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /unreadable date/);
});

test("an Amount Currency column beside Currency does not hide the mixed-currency warning", () => {
  const r = readStatement(`Date,Label,Currency,Amount,Amount Currency,Partner Name,Bank Account\n2018-12-15,Supplier,USD,-33.5,0,John Doe,123\n2018-12-15,Payment,EUR,1525,1000,Azure,\n`);
  assert.deepEqual(r.rows.map((x) => x.cents), [-3350, 152500]);
  assert.ok(r.problems.some((p) => /mixes currencies/.test(p)));
});
