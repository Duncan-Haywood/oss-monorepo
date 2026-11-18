import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Column layouts taken from the source of the ofxstatement-revolut 2.0.4 and
// ofxstatement-n26 0.3 plugins (PyPI sdists; layout only, every row here is
// made up). Both read correctly when probed on 2026-11-04; kept as a guard.

test("Revolut: pending and reverted rows are skipped by name, the fee joins the amount", () => {
  const r = readStatement([
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    "CARD_PAYMENT,Current,2023-03-01 10:15:00,2023-03-02 08:00:00,Shop One,-12.50,0.00,EUR,COMPLETED,987.50",
    "CARD_PAYMENT,Current,2023-03-04 09:00:00,,Shop Two,-9.00,0.00,EUR,PENDING,",
    "CARD_PAYMENT,Current,2023-03-05 09:00:00,2023-03-05 09:00:05,Shop Three,-5.00,0.00,EUR,REVERTED,1087.50",
    "EXCHANGE,Current,2023-03-06 09:00:00,2023-03-06 09:00:05,Exchanged to USD,-50.00,0.50,EUR,COMPLETED,1037.00",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2023-03-02", -1250], ["2023-03-06", -5050]]);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[0], /PENDING/);
  assert.match(r.problems[1], /REVERTED/);
});

test("N26: signed euro amount column, payee as description", () => {
  const r = readStatement([
    "Date,Payee,Account number,Transaction type,Payment reference,Category,Amount (EUR),Amount (Foreign Currency),Type Foreign Currency,Exchange Rate",
    "2023-03-01,Shop One,,MasterCard Payment,,Groceries,-12.50,,,",
    "2023-03-02,Employer GmbH,DE89370400440532013000,Income,Salary March,Income,2500.00,,,",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2023-03-01", -1250, "Shop One"], ["2023-03-02", 250000, "Employer GmbH"]]);
  assert.deepEqual(r.problems, []);
});
