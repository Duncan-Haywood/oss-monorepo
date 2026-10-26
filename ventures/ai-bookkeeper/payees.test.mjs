import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { payeeReport } from "./payees.mjs";

const books = (lines) => importStatement(newBooks(), "Date,Description,Amount\n" + lines.join("\n") + "\n", "1000").books;

test("customers and suppliers are ranked with shares that sum to one", () => {
  const r = payeeReport(books([
    "2026-01-05,ACME ROOFING,6000.00", "2026-02-05,ACME ROOFING,2000.00", "2026-02-09,BETA STUDIO,2000.00",
    "2026-01-07,CLOUD HOST,-40.00", "2026-02-07,CLOUD HOST,-40.00", "2026-01-20,OFFICE SHOP,-20.00",
  ]));
  assert.deepEqual(r.customers.rows.map((x) => [x.payee, x.cents, x.count]), [["acme roofing", 800000, 2], ["beta studio", 200000, 1]]);
  assert.equal(r.customers.rows[0].share, 0.8);
  assert.equal(r.suppliers.rows[0].cents, 8000);
  assert.ok(Math.abs(r.suppliers.rows.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  assert.equal(r.customers.hhi, 0.8 * 0.8 + 0.2 * 0.2);
});

test("a payer above the threshold is warned about; an even spread is not", () => {
  const even = payeeReport(books(["2026-01-01,AAA ONE,100.00", "2026-01-02,BBB TWO,100.00", "2026-01-03,CCC THREE,100.00", "2026-01-04,DDD FOUR,100.00", "2026-01-05,EEE FIVE,100.00"]));
  assert.deepEqual(even.warnings, []);
  const heavy = payeeReport(books(["2026-01-01,AAA ONE,900.00", "2026-01-02,BBB TWO,100.00"]));
  assert.match(heavy.warnings[0], /90%/);
});

test("the period limits the lines, and a single payer is said so", () => {
  const b = books(["2026-01-01,AAA ONE,100.00", "2026-03-01,BBB TWO,100.00"]);
  const r = payeeReport(b, { from: "2026-02-01", to: "2026-03-31" });
  assert.equal(r.customers.payees, 1);
  assert.match(r.warnings[0], /one payer/);
});

test("transfers between own accounts are skipped and unreviewed lines are counted", () => {
  const b = books(["2026-01-01,AAA ONE,100.00"]);
  b.transactions[0].status = "transfer";
  assert.equal(payeeReport(b).customers.payees, 0);
  b.transactions[0].status = "review";
  const r = payeeReport(b);
  assert.equal(r.unreviewed, 1);
  assert.equal(r.customers.total, 10000);
});

test("a payment processor's payouts are shown but are not a concentration warning", () => {
  const r = payeeReport(books(["2026-01-01,STRIPE PAYOUT,9000.00", "2026-01-02,SMALL CLIENT,1000.00"]));
  assert.equal(r.customers.rows[0].conduit, true);
  assert.deepEqual(r.warnings, []);
});
