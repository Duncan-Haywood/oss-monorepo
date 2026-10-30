import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { readPayoutReport, planPayouts } from "./payouts.mjs";

// Adyen's settlement details report, in the column order Adyen documents. Every
// value is made up; no real export has been tried.
const HEAD = "Company Account,Merchant Account,Psp Reference,Merchant Reference,Payment Method,Creation Date,TimeZone,Type,Modification Reference,Gross Currency,Gross Debit (GC),Gross Credit (GC),Exchange Rate,Net Currency,Net Debit (NC),Net Credit (NC),Commission (NC),Markup (NC),Scheme Fees (NC),Interchange (NC),Payment Method Variant,Modification Merchant Reference,Batch Number";
const row = (psp, ref, date, type, gd, gc, nd, nc, com, mk, sf, ic, batch) => `Co,Shop,${psp},${ref},visa,${date} 10:00:00,CET,${type},,EUR,${gd},${gc},1,EUR,${nd},${nc},${com},${mk},${sf},${ic},visacredit,,${batch}`;
const REPORT = [HEAD,
  row("A1", "order-1", "2026-03-02", "Received", "", "100.00", "", "", "", "", "", "", ""),
  row("A2", "order-1", "2026-03-03", "Settled", "", "100.00", "", "96.30", "1.20", "0.30", "0.50", "1.70", "7"),
  row("A3", "order-2", "2026-03-03", "Settled", "", "50.00", "", "48.40", "0.60", "0.15", "0.25", "0.60", "7"),
  row("A4", "order-1", "2026-03-04", "Refunded", "20.00", "", "20.00", "", "", "", "", "", "7"),
  row("A5", "", "2026-03-05", "Fee", "", "", "2.00", "", "", "", "", "", "7"),
  row("A6", "", "2026-03-06", "MerchantPayout", "", "", "122.70", "", "", "", "", "", "7"),
  row("B1", "order-3", "2026-03-10", "Settled", "", "10.00", "", "9.50", "0.20", "0", "0.10", "0.20", "8"),
].join("\n") + "\n";
const books = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;

test("Adyen: a batch splits into sales, refunds, fees and costs and ties to the MerchantPayout", () => {
  const r = readPayoutReport(REPORT);
  assert.equal(r.source, "adyen");
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "7");
  assert.equal(p.date, "2026-03-06");
  assert.equal(p.net, 9630 + 4840 - 2000 - 200);
  assert.equal(p.gross, 10000 + 5000 - 2000 - 200);
  assert.equal(p.fees, 370 + 160);
});

test("Adyen: a batch with no MerchantPayout row yet is pending, not split", () => {
  const r = readPayoutReport(REPORT);
  assert.equal(r.pending.length, 1);
  assert.match(r.problems.join("\n"), /Batch 8: no MerchantPayout/);
});

test("Adyen: a payout that does not equal the batch is reported, not split", () => {
  const r = readPayoutReport(REPORT.replace("122.70", "120.00"));
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems.join("\n"), /Batch 7: the MerchantPayout row is 120\.00 but the batch's other rows net 122\.70/);
});

test("Adyen: the payout matches its bank line", () => {
  const plan = planPayouts(books([["2026-03-07", "ADYEN PAYOUT", "122.70"]]), readPayoutReport(REPORT));
  assert.equal(plan.matched.length, 1);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 13000 }, { account: "6010", cents: -730 }]);
  assert.equal(plan.matched[0].parts.reduce((a, x) => a + x.cents, 0), 12270);
});
