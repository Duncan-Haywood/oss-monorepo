// Maybe's Mint-shaped import fixture (maybe-finance/maybe, test/fixtures/files/imports/mint.csv; layout only, every row here is made up): a "Transaction Type" column of debit/credit beside a SIGNED amount where debits are positive and credits negative. The type column was ignored once any amount had a minus sign, so spending read as income.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const head = "Date,Description,Original Description,Amount,Transaction Type,Category";

test("debit-positive signed amounts follow the Transaction Type marker", () => {
  const { rows } = readStatement([head,
    "05/01/2023,Grocery,SAFEWAY #1,78.32,debit,Groceries",
    "05/02/2023,Refund,SHELL,-45.67,credit,Gas",
    "05/04/2023,Pay,ACME PAYROLL,-2500.00,credit,Paycheck"].join("\n"));
  assert.deepEqual(rows.map((r) => r.cents), [-7832, 4567, 250000]);
});

test("unsigned amounts still follow the marker", () => {
  const { rows } = readStatement([head, "05/01/2023,A,A,10.00,debit,x", "05/02/2023,B,B,20.00,credit,y"].join("\n"));
  assert.deepEqual(rows.map((r) => r.cents), [-1000, 2000]);
});

test("a mixed-sign file with a type column keeps the amounts' own signs", () => {
  const { rows } = readStatement([head, "05/01/2023,A,A,-10.00,debit,x", "05/02/2023,B,B,20.00,debit,y", "05/03/2023,C,C,5.00,credit,z"].join("\n"));
  assert.deepEqual(rows.map((r) => r.cents), [-1000, 2000, 500]);
});
