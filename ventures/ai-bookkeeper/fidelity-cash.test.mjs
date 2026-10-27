import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Rows made up in the layouts of Fidelity's two activity exports (found by sweeping
// redstreet/beancount_reds_importers' test files, read only, nothing copied).
const CMA = `Run Date,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/27/2023, DIRECT DEBIT ACME UTILITY AUTOPAY (Cash),  , No Description,Cash,,,,,,-125.5,
01/23/2023, DIRECT DEPOSIT WIDGETS INC PAYROLL (Cash),  , No Description,Cash,,,,,,2000,
`;

test("Fidelity cash-management export: the Action text is the description", () => {
  const { rows } = readStatement(CMA);
  assert.deepEqual(rows.map((r) => [r.desc, r.cents]), [["DIRECT DEBIT ACME UTILITY AUTOPAY", -12550], ["DIRECT DEPOSIT WIDGETS INC PAYROLL", 200000]]);
});

const ALL = `Run Date,Account,Account Number,Action,Symbol,Description,Type,Exchange Quantity,Exchange Currency,Currency,Price,Quantity,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Settlement Date
12/03/2025,"IRA","111","DIVIDEND RECEIVED FUND ONE (ONE) (Cash)",ONE,"FUND ONE",Cash,0,,USD,,0,0,,,,10.00,
12/03/2025,"IRA","111","REINVESTMENT FUND ONE (ONE) (Cash)",ONE,"FUND ONE",Cash,0,,USD,5,2,0,,,,-10.00,
12/04/2025,"IRA","111","YOU BOUGHT FUND TWO (TWO) (Cash)",TWO,"FUND TWO",Cash,0,,USD,5,4,0,,,,-20.00,
`;

test("Fidelity all-accounts export: dividends are booked, buys and reinvestments are not", () => {
  const { rows, problems } = readStatement(ALL);
  assert.deepEqual(rows.map((r) => [r.desc, r.cents]), [["DIVIDEND RECEIVED FUND ONE (ONE)", 1000]]);
  assert.match(problems.join(" "), /2 brokerage buy\/sell lines were not booked/);
});
