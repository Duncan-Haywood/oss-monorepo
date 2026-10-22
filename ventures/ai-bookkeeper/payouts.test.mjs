import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal } from "./engine.mjs";
import { balances } from "./ledger.mjs";
import { readPayoutReport, planPayouts, applyPayouts } from "./payouts.mjs";

const books = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;

const HEAD = "automatic_payout_id,automatic_payout_effective_at,balance_transaction_id,created,reporting_category,gross,fee,net,description";
const REPORT = `${HEAD}
po_1,2026-03-05,txn_a,2026-03-02,charge,500.00,14.80,485.20,Order 1
po_1,2026-03-05,txn_b,2026-03-03,charge,300.00,9.00,291.00,Order 2
po_1,2026-03-05,txn_c,2026-03-04,refund,-50.00,0.00,-50.00,Refund order 1
po_1,2026-03-05,txn_d,2026-03-04,dispute,-100.00,15.00,-115.00,Dispute
po_1,2026-03-05,txn_p,2026-03-05,payout,--611.20,0.00,-611.20,STRIPE PAYOUT
po_2,2026-03-12,txn_e,2026-03-10,charge,100.00,3.20,96.80,Order 3
,,txn_f,2026-03-14,charge,40.00,1.46,38.54,Not paid out yet
`;

test("a report reads into payouts with gross, fees and net", () => {
  const r = readPayoutReport(REPORT);
  assert.equal(r.payouts.length, 2);
  const p = r.payouts[0];
  assert.equal(p.net, 48520 + 29100 - 5000 - 11500);
  assert.equal(p.fees, 1480 + 900 + 1500);
  assert.equal(r.pending.length, 1);
  assert.deepEqual(r.problems, []);
});

test("a row whose net is not gross less fee is reported, not used", () => {
  const r = readPayoutReport(`${HEAD}\npo_9,2026-03-05,t,2026-03-01,charge,100.00,3.00,90.00,x\n`);
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0], /net/);
});

test("a report with no payout id column is refused with a hint", () => {
  assert.throws(() => readPayoutReport("created,reporting_category,gross,fee,net\n2026-01-01,charge,1,0,1\n"), /payout id/);
});

const bankRows = [["2026-03-06", "STRIPE PAYOUT", "611.20"], ["2026-03-13", "STRIPE TRANSFER", "96.80"], ["2026-03-06", "Coffee", "-4.00"]];

test("payouts match the bank line and split into sales, refunds, fees", () => {
  const plan = planPayouts(books(bankRows), readPayoutReport(REPORT));
  assert.equal(plan.matched.length, 2);
  assert.equal(plan.unmatched.length, 0);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 75000 }, { account: "6010", cents: -13880 }]);
  assert.deepEqual(plan.matched[1].parts, [{ account: "4000", cents: 10000 }, { account: "6010", cents: -320 }]);
});

test("applying posts gross sales and fees to the journal, and the bank gets the net", () => {
  const b = books(bankRows);
  const plan = planPayouts(b, readPayoutReport(REPORT));
  const { books: after, posted } = applyPayouts(b, plan);
  assert.equal(posted, 2);
  const bal = balances(journal(after));
  assert.equal(bal.get("1000"), 61120 + 9680);
  assert.equal(bal.get("4000"), -85000);
  assert.equal(bal.get("6010"), 14200);
});

test("a payout with no bank line is unmatched, and one already split is done", () => {
  const b = books([["2026-03-06", "STRIPE PAYOUT", "611.20"]]);
  const rep = readPayoutReport(REPORT);
  const plan = planPayouts(b, rep);
  assert.equal(plan.matched.length, 1);
  assert.equal(plan.unmatched.length, 1);
  assert.match(plan.unmatched[0].why, /no unsplit bank line/);
  const { books: after } = applyPayouts(b, plan);
  const again = planPayouts(after, rep);
  assert.equal(again.done.length, 1);
  assert.equal(again.matched.length, 0);
});

test("two payouts of the same amount take two different lines", () => {
  const rep = readPayoutReport(`${HEAD}\np1,2026-03-05,a,2026-03-01,charge,100.00,0.00,100.00,x\np2,2026-03-06,b,2026-03-01,charge,100.00,0.00,100.00,x\n`);
  const plan = planPayouts(books([["2026-03-05", "DEP", "100.00"], ["2026-03-06", "DEP", "100.00"]]), rep);
  assert.equal(plan.matched.length, 2);
  assert.notEqual(plan.matched[0].line, plan.matched[1].line);
  assert.equal(plan.matched[0].single, true);
});

test("a role pointing at a missing account is refused", () => {
  assert.throws(() => planPayouts(books(bankRows), readPayoutReport(REPORT), { fees: "6999" }), /No account 6999/);
});

test("a Shopify payout transactions CSV reads and splits", () => {
  const shop = `Transaction Date,Type,Order Name,Amount,Fee,Net,Payout Date,Payout ID
2026-03-01,charge,#1001,100.00,3.20,96.80,2026-03-04,111
2026-03-02,refund,#1000,-20.00,0.00,-20.00,2026-03-04,111
2026-03-02,adjustment,,-5.00,0.00,-5.00,2026-03-04,111
`;
  const r = readPayoutReport(shop);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 7180);
  const plan = planPayouts(books([["2026-03-05", "SHOPIFY", "71.80"]]), r, { other: "4100" });
  assert.equal(plan.matched.length, 1);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 8000 }, { account: "6010", cents: -320 }, { account: "4100", cents: -500 }]);
});

test("a Square transfer report reads with no category column", () => {
  const r = readPayoutReport("Transfer ID,Deposit Date,Date,Total Collected,Fees,Net Total\nsq_1,2026-03-05,2026-03-03,200.00,5.80,194.20\nsq_1,2026-03-05,2026-03-04,-20.00,0.00,-20.00\n");
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 17420);
  assert.deepEqual(planPayouts(books([["2026-03-06", "SQUARE INC", "174.20"]]), r).matched[0].parts, [{ account: "4000", cents: 18000 }, { account: "6010", cents: -580 }]);
});

const PP = "Date,Time,TimeZone,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID";
test("a PayPal activity CSV splits each withdrawal over the payments before it, newest-first too", () => {
  const rows = ["03/02/2026,10:00:00,PST,Ann,Website Payment,Completed,USD,100.00,-3.20,96.80,T1", "03/03/2026,11:00:00,PST,Bob,Website Payment,Completed,USD,50.00,-1.75,48.25,T2", "03/04/2026,09:00:00,PST,Ann,Payment Refund,Completed,USD,-20.00,0.00,-20.00,T3", "03/05/2026,12:00:00,PST,Bank,General Withdrawal,Completed,USD,-125.05,0.00,-125.05,W1", "03/06/2026,12:00:00,PST,Cy,Website Payment,Completed,USD,10.00,-0.59,9.41,T4", "03/07/2026,12:00:00,PST,Dee,Website Payment,Pending,USD,10.00,-0.59,9.41,T5"];
  for (const order of [rows, [...rows].reverse()]) {
    const r = readPayoutReport([PP, ...order].join("\n") + "\n");
    assert.equal(r.payouts.length, 1);
    assert.equal(r.payouts[0].id, "W1");
    assert.equal(r.payouts[0].net, 12505);
    assert.equal(r.payouts[0].fees, 495);
    assert.equal(r.pending.length, 1);
    assert.deepEqual(r.problems, []);
    const plan = planPayouts(books([["2026-03-06", "PAYPAL TRANSFER", "125.05"]]), r);
    assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 13000 }, { account: "6010", cents: -495 }]);
  }
});

test("a PayPal withdrawal that does not equal the payments is reported, not split", () => {
  const r = readPayoutReport([PP, "03/02/2026,10:00:00,PST,Ann,Website Payment,Completed,USD,100.00,-3.20,96.80,T1", "03/05/2026,12:00:00,PST,Bank,General Withdrawal,Completed,USD,-50.00,0.00,-50.00,W1"].join("\n") + "\n");
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /carried over/);
});
