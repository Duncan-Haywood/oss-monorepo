// The held-out new-payee harness on made-up rows (the real sets are fetched at run time).
import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, loadHackclub, loadChase } from "./new-payees.mjs";
import { parseLedger } from "./hackclub-ledger.mjs";

const ledger = `2015/01/02 Lyft
    Expenses:Operating:Transportation:Ground      $12.50
    Assets:Wells Fargo:Checking

2015/01/03 Lyft
    Expenses:Operating:Transportation:Ground   $1,020.00
    Assets:Wells Fargo:Checking

2015/01/04 Some Diner
    Expenses:Operating:Food                       $30.00
    Assets:Wells Fargo:Checking
`;

test("hackclub ledger rows carry their amount", () => {
  assert.deepEqual(parseLedger(ledger).map((r) => r.amount), [12.5, 1020, 30]);
  assert.deepEqual(loadHackclub(ledger).map((r) => r.cents), [-1250, -102000, -3000]);
});

test("first-seen and seen-before lines are scored apart, the layer switch works", () => {
  const rows = loadHackclub(ledger);
  const on = replay(rows), off = replay(rows, { skip: new Set(["new-payee"]) });
  assert.equal(on.first.n, 2); // Lyft, Some Diner
  assert.equal(on.repeat.n, 1);
  assert.equal(on.repeat.right, 1); // memory from the day before
  assert.equal(off.firstBySource["new-payee"], undefined);
});

test("chase sales keep their own dates", () => {
  const csv = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n12/24/2023,12/24/2023,CHIPOTLE ONLINE,Food & Drink,Sale,-33.17,\n12/20/2023,12/21/2023,PAYMENT THANK YOU,,Payment,500.00,\n12/02/2023,12/03/2023,SHELL OIL 123,Gas,Sale,-40.00,\n";
  assert.deepEqual(loadChase(csv).map((r) => [r.date, r.desc, r.cents]), [["2023-12-24", "CHIPOTLE ONLINE", -3317], ["2023-12-02", "SHELL OIL 123", -4000]]);
});
