import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments } from "./accruals.mjs";
import { planBills } from "./billpay.mjs";

// A bank account with $1,000 in it and no history, so the forecast is only the documents.
const make = (docs, bank = 100000) => {
  const b = addDocuments(newBooks(), "type,number,date,due,party,amount,account\n" + docs).books;
  const acct = b.accounts.find((a) => a.bank && a.type === "asset") ?? b.accounts.find((a) => a.type === "asset");
  acct.bank = true;
  b.transactions.push({ id: "t0", date: "2026-05-01", desc: "Opening", cents: bank, account: acct.code, balance: bank });
  return b;
};

test("bills that fit are paid on their due dates; a late one tomorrow", () => {
  const p = planBills(make("bill,1,2026-04-01,2026-04-20,Old Supplier,100.00,6130\nbill,2,2026-05-01,2026-05-20,Hosting,200.00,6130\n"), { asOf: "2026-05-01" });
  const [a, b] = p.rows;
  assert.equal(a.id, "BILL-1"); assert.equal(a.payOn, "2026-05-02"); assert.equal(a.status, "late now");
  assert.equal(b.payOn, "2026-05-20"); assert.equal(b.status, "on time");
  assert.equal(p.lowest.cents, 70000);
});

test("a bill that would break the reserve waits for an invoice to be paid", () => {
  const p = planBills(make("bill,1,2026-05-01,2026-05-10,Big Supplier,900.00,6130\ninvoice,7,2026-04-25,2026-05-15,Client,500.00,4000\n"), { asOf: "2026-05-01", reserve: 30000 });
  const r = p.rows[0];
  assert.equal(r.status, "deferred"); assert.equal(r.payOn, "2026-05-15"); assert.equal(r.delay, 5);
  assert.equal(p.shortfall, 0);
  assert.ok(p.lowest.cents >= 30000);
});

test("a bill no income can cover is reported with the shortfall, and earlier bills get the cash first", () => {
  const p = planBills(make("bill,1,2026-05-01,2026-05-05,Rent,800.00,6130\nbill,2,2026-05-01,2026-05-06,Parts,800.00,6130\n"), { asOf: "2026-05-01" });
  assert.equal(p.rows.find((r) => r.id === "BILL-1").status, "on time");
  assert.equal(p.rows.find((r) => r.id === "BILL-2").status, "cannot fit");
  assert.equal(p.shortfall, 80000);
});

test("no bills, no rows", () => {
  const p = planBills(make("invoice,1,2026-04-25,2026-05-15,Client,500.00,4000\n"), { asOf: "2026-05-01" });
  assert.deepEqual(p.rows, []);
});
