import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { readPayoutReport, planPayouts, applyPayouts } from "./payouts.mjs";
import { reconcile1099K, reportable1099K, defaultProcessor } from "./form1099k.mjs";
import { readFileSync } from "node:fs";

const HEAD = "automatic_payout_id,automatic_payout_effective_at,balance_transaction_id,created,reporting_category,gross,fee,net,description";
const REPORT = `${HEAD}
po_1,2026-03-05,a,2026-03-02,charge,500.00,14.80,485.20,o1
po_1,2026-03-05,b,2026-03-03,charge,300.00,9.00,291.00,o2
po_1,2026-03-05,c,2026-03-04,refund,-50.00,0.00,-50.00,r1
po_2,2026-04-12,d,2026-04-10,charge,100.00,3.20,96.80,o3
,,e,2026-04-14,charge,40.00,1.46,38.54,pending
po_0,2025-12-30,f,2025-12-28,charge,70.00,2.33,67.67,last year
`;
const rep = () => readPayoutReport(REPORT);

test("form matching the report's gross reconciles with no gap", () => {
  const r = reconcile1099K(rep(), { gross: 94000 }, 2026);
  assert.equal(r.report.gross, 94000);
  assert.equal(r.report.refunds, 5000);
  assert.equal(r.bridge[2].cents, 0);
  assert.match(r.notes[0], /agree/);
});

test("a gap is reported with the other-year gross and the pending rows", () => {
  const r = reconcile1099K(rep(), { gross: 100000 }, 2026);
  assert.equal(r.bridge[2].cents, 6000);
  assert.ok(r.notes.some((n) => /other years/.test(n) && n.includes("70.00")));
  assert.ok(r.notes.some((n) => /not been paid out/.test(n)));
});

test("monthly boxes point at the month that differs and catch a typo in the sum", () => {
  const m = Array(12).fill(0); m[2] = 80000; m[3] = 14000;
  const r = reconcile1099K(rep(), { gross: 94000, months: m }, 2026);
  assert.deepEqual(r.monthly.filter((x) => x.diff).map((x) => x.month), []);
  m[3] = 15000;
  const r2 = reconcile1099K(rep(), { gross: 94000, months: m }, 2026);
  assert.ok(r2.notes.some((n) => /add up to/.test(n)));
  assert.ok(r2.notes.some((n) => /apr/.test(n)));
});

test("books: sales after splitting payouts fall short of form gross less refunds by the unpaid-out sale", () => {
  let b = importStatement(newBooks(), "Date,Description,Amount\n2026-03-05,STRIPE,726.20\n2026-04-12,STRIPE,96.80\n", "1000").books;
  const plan = planPayouts(b, rep());
  b = applyPayouts(b, plan).books;
  const r = reconcile1099K(rep(), { gross: 94000 }, 2026, b);
  assert.equal(r.ledger.books, 85000);
  assert.equal(r.ledger.expected, 89000);
  assert.equal(r.ledger.diff, -4000);
  assert.ok(r.notes.some((n) => /payouts --apply|not split/.test(n)));
});

test("bad input is refused", () => {
  assert.throws(() => reconcile1099K(rep(), {}, 2026), /box 1a/);
  assert.throws(() => reconcile1099K(rep(), { gross: 1, months: [1] }, 2026), /twelve/);
});

test("the numbers on form-1099-k-reconciliation.html come from the stripe-payouts fixture", async () => {
  const { readFileSync } = await import("node:fs");
  const rep = readPayoutReport(readFileSync(new URL("./fixtures/stripe-payouts.csv", import.meta.url), "utf8"));
  let b = importStatement(newBooks(), "Date,Description,Amount\n2026-03-05,STRIPE TRANSFER,611.20\n2026-03-12,STRIPE TRANSFER,96.80\n", "1000").books;
  b = applyPayouts(b, planPayouts(b, rep)).books;
  const r = reconcile1099K(rep, { gross: 94000 }, 2026, b);
  assert.equal(r.bridge[2].cents, 0);
  assert.equal(r.report.refunds, 5000);
  assert.equal(r.ledger.books, 85000);       // sales after splitting
  assert.equal(r.ledger.expected, 89000);    // gross less refunds; the 40.00 unpaid-out charge is the difference
  assert.equal(rep.payouts.reduce((a, p) => a + p.net, 0), 70800); // deposited
  const page = readFileSync(new URL("./form-1099-k-reconciliation.html", import.meta.url), "utf8");
  for (const n of ["$940.00", "$850.00", "$708.00", "$27.00", "$115.00"]) assert.ok(page.includes(n), n);
});

test("card processors report at any size; marketplaces only above $20,000 and 200 payments", () => {
  assert.equal(reportable1099K(rep(), 2026).reportable, true);
  const m = reportable1099K(rep(), 2026, { processor: "marketplace" });
  assert.equal(m.reportable, false);
  assert.match(m.why, /not above both/);
  const rows = Array.from({ length: 201 }, (_, i) => `po_9,2026-06-01,x${i},2026-05-${String(1 + (i % 28)).padStart(2, "0")},charge,100.00,3.00,97.00,s`).join("\n");
  const big = readPayoutReport(`${HEAD}\n${rows}\n`);
  assert.equal(reportable1099K(big, 2026, { processor: "marketplace" }).reportable, true);
  assert.throws(() => reportable1099K(big, 2026, { processor: "x" }));
});

test("a marketplace or wallet report defaults to the $20,000 and 200 rule, a card processor's to no minimum", () => {
  const fx = (f) => readPayoutReport(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
  assert.equal(defaultProcessor(fx("paypal-activity.csv")), "marketplace");
  assert.equal(defaultProcessor(fx("etsy-ledger.csv")), "marketplace");
  assert.equal(defaultProcessor(fx("airbnb-transactions.csv")), "marketplace");
  assert.equal(defaultProcessor(fx("stripe-payouts.csv")), "card");
  assert.equal(defaultProcessor(rep()), "card");
});
