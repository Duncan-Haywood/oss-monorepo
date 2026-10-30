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

test("terms: an early-payment discount is taken when cash holds, not when it would break the reserve", () => {
  const docs = "bill,1,2026-05-01,2026-05-31,Parts Co,1000.00,6130\n";
  const terms = { "parts co": { discountPct: 2, discountDays: 10 } };
  const rich = planBills(make(docs, 200000), { asOf: "2026-05-01", reserve: 30000, terms });
  assert.equal(rich.rows[0].saved, 2000); assert.equal(rich.rows[0].payOn, "2026-05-11");
  const tight = planBills(make(docs, 120000), { asOf: "2026-05-01", reserve: 30000, terms });
  assert.equal(tight.rows[0].saved, 0); assert.equal(tight.rows[0].payOn, "2026-05-31");
  assert.equal(planBills(make(docs, 200000), { asOf: "2026-05-01" }).rows[0].saved, 0);
});

test("terms: a late fee is reported on a deferred bill", () => {
  const books = make("bill,2,2026-05-01,2026-05-10,Big Supplier,900.00,6130\ninvoice,7,2026-04-25,2026-05-15,Client,500.00,4000\n");
  const p = planBills(books, { asOf: "2026-05-01", reserve: 30000, terms: { "BIG SUPPLIER": { lateFeePct: 5 } } });
  assert.equal(p.rows[0].fee, 4500); assert.match(p.rows[0].note, /late fee/);
});

test("a late fee counts toward the reserve: a bill that fits only without it is held longer", () => {
  const docs = "bill,1,2026-04-01,2026-04-20,Slow Supplier,700.00,6130\ninvoice,7,2026-04-25,2026-05-15,Client,100.00,4000\n";
  const opts = { asOf: "2026-05-01", reserve: 30000 };
  const plain = planBills(make(docs), opts).rows[0];
  assert.equal(plain.payOn, "2026-05-02");
  const p = planBills(make(docs), { ...opts, terms: { "slow supplier": { lateFeePct: 5 } } });
  const r = p.rows[0];
  assert.equal(r.fee, 3500); assert.equal(r.payOn, "2026-05-15"); assert.equal(r.status, "deferred");
  assert.ok(p.lowest.cents >= 30000);
});

test("two bills due together: the larger gets the cash first, then the lower id on a tie", () => {
  const p = planBills(make("bill,1,2026-05-01,2026-05-10,Small,300.00,6130\nbill,2,2026-05-01,2026-05-10,Large,800.00,6130\n"), { asOf: "2026-05-01" });
  assert.equal(p.rows.find((r) => r.id === "BILL-2").status, "on time");
  assert.equal(p.rows.find((r) => r.id === "BILL-1").status, "cannot fit");
  const q = planBills(make("bill,1,2026-05-01,2026-05-10,Same A,800.00,6130\nbill,2,2026-05-01,2026-05-10,Same B,800.00,6130\n"), { asOf: "2026-05-01" });
  assert.equal(q.rows.find((r) => r.id === "BILL-1").status, "on time");
  assert.equal(q.rows.find((r) => r.id === "BILL-2").status, "cannot fit");
});

test("a discount window starting tomorrow is used, and landing exactly on the reserve counts as holding it", () => {
  const terms = { "parts co": { discountPct: 2, discountDays: 1 } };
  const r = planBills(make("bill,1,2026-05-01,2026-05-31,Parts Co,1000.00,6130\n", 100000), { asOf: "2026-05-01", reserve: 2000, terms }).rows[0];
  assert.equal(r.saved, 2000); assert.equal(r.payOn, "2026-05-02"); assert.equal(r.status, "on time");
});

test("no discount when it needs early cash that is not there, even if the bill is paid later with the window gone", () => {
  const docs = "bill,1,2026-05-01,2026-05-20,Parts Co,900.00,6130\ninvoice,7,2026-04-25,2026-05-15,Client,500.00,4000\n";
  const r = planBills(make(docs, 100000), { asOf: "2026-05-01", reserve: 30000, terms: { "parts co": { discountPct: 2, discountDays: 5 } } }).rows[0];
  assert.equal(r.status, "on time"); assert.equal(r.payOn, "2026-05-20"); assert.equal(r.saved, 0);
});

test("a bill one day past due is paid tomorrow and called late now", () => {
  const r = planBills(make("bill,1,2026-04-01,2026-04-30,Supplier,100.00,6130\n"), { asOf: "2026-05-01" }).rows[0];
  assert.equal(r.daysLate, 1); assert.equal(r.status, "late now"); assert.equal(r.payOn, "2026-05-02");
});

test("the default reserve is zero: a bill may take the balance to exactly nothing", () => {
  const p = planBills(make("bill,1,2026-05-01,2026-05-05,Rent,1000.00,6130\n"), { asOf: "2026-05-01" });
  assert.equal(p.rows[0].status, "on time"); assert.equal(p.lowest.cents, 0);
});

test("terms: a bill that cannot fit even with later cash carries no late fee, since it is shown on its due date", () => {
  const books = make("bill,2,2026-05-01,2026-05-10,Big Supplier,900.00,6130\ninvoice,7,2026-04-25,2026-05-15,Client,500.00,4000\n");
  const p = planBills(books, { asOf: "2026-05-01", reserve: 30000, terms: { "big supplier": { lateFeePct: 50 } } });
  assert.equal(p.rows[0].status, "cannot fit"); assert.equal(p.rows[0].payOn, "2026-05-10"); assert.equal(p.rows[0].fee, 0);
});
