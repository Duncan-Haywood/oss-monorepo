// Cash-basis profit and loss from accrual books. Documents and bank lines are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, addDocuments, writeOff } from "./engine.mjs";
import { trialBalance } from "./ledger.mjs";
import { cashBasis } from "./cashbasis.mjs";

const build = (docs, bank) => {
  let b = addDocuments(newBooks(), "type,number,date,party,amount,account,against\n" + docs.join("\n") + "\n").books;
  if (bank.length) b = importStatement(b, "Date,Description,Amount\n" + bank.join("\n") + "\n", "1000").books;
  return addDocuments(b, "").books;
};

test("income counts when paid, an unpaid bill not at all, a part-payment in part", () => {
  const b = build(["invoice,1,2026-01-10,Acme,1000.00,4000,", "invoice,2,2026-01-20,Beta,500.00,4000,", "bill,9,2026-01-15,Sup,200.00,6100,"],
    ["2026-02-05,PAYMENT 1 ACME,1000.00", "2026-02-07,PART PAYMENT 2,200.00"]);
  const r = cashBasis(b);
  assert.equal(r.profitAndLoss.totalIncome, 120000);
  assert.equal(r.profitAndLoss.totalExpense, 0);
  assert.deepEqual(r.profitAndLoss.months, ["2026-02"]);
  assert.equal(r.accrual.net, 130000);
  assert.equal(r.timing.net, 130000 - 120000);
});

test("a payment in a later month moves the income there; the last payment takes the rounding", () => {
  const b = build(["invoice,1,2026-01-10,Acme,100.01,4000,"], ["2026-02-01,PART PAYMENT 1,33.34", "2026-03-01,PART PAYMENT 1,33.33", "2026-04-01,PAYMENT 1,33.34"]);
  const r = cashBasis(b), p = r.profitAndLoss;
  assert.equal(p.totalIncome, 10001);
  assert.equal(p.months.length, 3);
});

test("a credit note applied to an invoice shrinks the income recognised", () => {
  const b = build(["invoice,1,2026-01-10,Acme,1000.00,4000,", "credit note,C1,2026-01-20,Acme,100.00,4000,1"], ["2026-02-05,PAYMENT 1 ACME,900.00"]);
  const r = cashBasis(b);
  assert.equal(r.profitAndLoss.totalIncome, 90000);
  assert.equal(r.accrual.totalIncome, 90000);
  assert.equal(r.timing.net, 0);
});

test("a write-off never counts and is reported", () => {
  let b = build(["invoice,1,2026-01-10,Acme,300.00,4000,"], []);
  b = writeOff(b, "INV-1", { date: "2026-06-01" }).books;
  const r = cashBasis(b);
  assert.equal(r.profitAndLoss.totalIncome, 0);
  assert.equal(r.accrual.net, -r.accrual.totalExpense + r.accrual.totalIncome);
  assert.match(r.notes.join(" "), /INV-1|1\b/);
});

test("the input books are not changed", () => {
  const b = build(["invoice,1,2026-01-10,Acme,1000.00,4000,"], ["2026-02-05,PAYMENT 1 ACME,1000.00"]);
  const before = JSON.stringify(b);
  cashBasis(b);
  assert.equal(JSON.stringify(b), before);
});

test("random books: fully paid documents agree with accrual, cash never counts unpaid ones", () => {
  let s = 4242;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 150; i++) {
    const docs = [], bank = [];
    let paidIn = 0, paidOut = 0;
    for (let k = 1; k <= 5; k++) {
      const inv = r() < 0.6, c = 100 + Math.floor(r() * 500000), num = `${inv ? "I" : "B"}${k}`;
      docs.push(`${inv ? "invoice" : "bill"},${num},2026-01-${String(k).padStart(2, "0")},P${k}x,${(c / 100).toFixed(2)},${inv ? 4000 : 6100},`);
      if (r() < 0.6) { bank.push(`2026-0${2 + (k % 3)}-10,PAYMENT ${num},${((inv ? c : -c) / 100).toFixed(2)}`); if (inv) paidIn += c; else paidOut += c; }
    }
    const b = build(docs, bank);
    const x = cashBasis(b);
    assert.equal(x.profitAndLoss.totalIncome, paidIn, "income " + JSON.stringify({ docs, bank }));
    assert.equal(x.profitAndLoss.totalExpense, paidOut, "expense " + JSON.stringify({ docs, bank }));
  }
});
