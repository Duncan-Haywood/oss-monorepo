import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { readPayoutReport, planPayouts } from "./payouts.mjs";

// PayPal's Balance Reconciliation report: RH rows, an RD column row (first columns of
// the layout PayPal documents), RD detail rows, an RF footer. Values are made up; the
// layout was checked against PayPal's own published sample file on 2026-10-25.
const COLS = "RD,Merchant Account ID,Record ID,Related Record ID,Invoice ID,Original Invoice ID,Partner Identifier,Created At,Record Type,Record Subtype,Transaction Currency,Gross Transaction Amount,Total Gross Fees,Total Net Fees,Partner Commission,Net Transaction Amount,Settlement Currency,Settlement Amount,Pending Settlement Amount,Exchange Rate,Gratuity,Reference Type,Reference ID,Payout Reference ID,Transfer ID";
const row = (id, at, type, sub, gross, gfees, nfees, comm, net, transfer = "") => `RD,ACCT,${id},,,,P,${at},${type},${sub},USD,${gross},${gfees},${nfees},${comm},${net},USD,0.00,0.00,1,,,,,${transfer}`;
const REPORT = ["RH,Report Name,Report Status", "RH,BALANCE_RECONCILIATION_REPORT,Success", COLS,
  row("S1", "2026-07-02 14:25:07 -0400", "Sale", "", "101.00", "-0.64390", "0.00", "-2.00", "99.00", "T1"),
  row("S2", "2026-07-02 15:00:00 -0400", "Sale", "", "50.00", "-0.40", "-1.60", "0.00", "48.40", "T1"),
  row("R1", "2026-07-02 16:00:00 -0400", "Refund", "Referenced", "-3.00", "0.00", "0.00", "0.00", "-3.00", "T1"),
  row("S3", "2026-07-02 17:00:00 -0400", "Sale", "", "20.00", "-0.10", "0.00", "0.00", "20.00"),
  "RD,,,,,,P,2026-07-02 19:59:59 -0400,Fees,Scheme Fees,GBP,,-0.02301",
  "RF,File Number,Total Records,Total Files", "RF,1,5,1"].join("\n") + "\n";
const books = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;

test("PayPal balance report: rows sharing a Transfer ID are one deposit, net of commission and net-billed fees", () => {
  const r = readPayoutReport(REPORT);
  assert.equal(r.source, "paypal");
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "T1");
  assert.equal(p.net, 9900 + 4840 - 300);
  assert.equal(p.gross, 10100 + 5000 - 300);
  assert.equal(p.fees, 200 + 160);
});

test("PayPal balance report: a row with no Transfer ID is pending; gross-settled fees are noted, not deposited", () => {
  const r = readPayoutReport(REPORT);
  assert.deepEqual(r.pending.map((x) => x.id), ["S3"]);
  assert.match(r.problems.join("\n"), /Gross-settled fees of 0\.02 are invoiced separately/);
});

test("PayPal balance report: the deposit matches its bank line", () => {
  const plan = planPayouts(books([["2026-07-03", "PAYPAL TRANSFER", "144.40"]]), readPayoutReport(REPORT));
  assert.equal(plan.matched.length, 1);
  assert.equal(plan.matched[0].parts.reduce((a, x) => a + x.cents, 0), 14440);
});
