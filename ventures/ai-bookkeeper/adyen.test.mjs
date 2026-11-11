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

// The column layout of Adyen's published sample report (batch 134, the 2023
// "migration" layout, 64 columns; eval/adyen-sample.mjs fetches and runs the
// real file). Rows below are made up in that layout; the journal types and their
// meaning are from Adyen's "Journal types" table (read 2026-11-11).
const HEAD64 = "Company Account,Merchant Account,Psp Reference,Merchant Reference,Payment Method,Creation Date,TimeZone,Creation Date (AMS),Type,Modification Reference,Gross Currency,Gross Debit (GC),Gross Credit (GC),Exchange Rate,Net Currency,Net Debit (NC),Net Credit (NC),Commission (NC),Markup (NC),Scheme Fees (NC),Interchange (NC),DCC Markup (NC),Advanced (NC),Advancement Code,Advancement Batch,Booking Type,Payment Method Variant,Batch Number,Reserved1,Reserved2,Reserved3,Reserved4,Reserved5,Reserved6,Reserved7,Reserved8,Reserved9,Reserved10,Acquirer,Modification Merchant Reference,Split Settlement,Booking Date,Booking Date TimeZone,Booking Date (AMS),AdditionalType,Issuer Country,Shopper Country,Clearing Network,Terminal ID,Tender Reference,Merchant Order Reference,Metadata,Pos Transaction Date,Pos Transaction Date TimeZone,Store,Dispute Reference,Register Booking Type,ARN,Shopper Reference,Payment Transaction Group,Settlement Flow,Split Payment Data,Authorisation Code,Card Number";
const r64 = ({ psp = "", ref = "", date, type, nd = "", nc = "", costs = ["", "", "", ""], batch, mmref = "" }) => {
  const c = Array(64).fill("");
  Object.assign(c, { 0: "Co", 1: "Shop", 2: psp, 3: ref, 5: `${date} 12:00:00`, 6: "CET", 8: type, 9: type === "Balancetransfer" ? "Balancetransfer" : "", 14: "EUR", 15: nd, 16: nc, 17: costs[0], 18: costs[1], 19: costs[2], 20: costs[3], 27: batch, 39: mmref });
  return c.join(",");
};
const sale = (psp, date, nc, batch) => r64({ psp, ref: psp, date, type: "Settled", nc, costs: ["0.00", "0.10", "0.05", "0.25"], batch });
const report = (...rows) => [HEAD64, ...rows].join("\n") + "\n";

test("Adyen sample layout: Balancetransfer is a carry between batches, not income, and a carried batch ties", () => {
  assert.equal(HEAD64.split(",").length, 64);
  const r = readPayoutReport(report(
    r64({ date: "2026-04-01", type: "Balancetransfer", nc: "1000.00", batch: "20", mmref: "Balancetransfer from batch 19" }),
    sale("S1", "2026-04-02", "49.60", "20"),
    sale("S2", "2026-04-02", "24.60", "20"),
    r64({ date: "2026-04-03", type: "Fee", nd: "0.20", batch: "20" }),
    r64({ date: "2026-04-03", type: "Balancetransfer", nd: "1074.00", batch: "20", mmref: "Balancetransfer to batch 21" }),
  ));
  assert.equal(r.payouts.length, 0);
  assert.equal(r.rows.filter((x) => x.kind === "other").length, 0, "no carry is booked as other income");
  assert.deepEqual(r.pending.map((x) => x.kind).sort(), ["fees", "sales", "sales"]);
  assert.match(r.problems.join("\n"), /Batch 20: no MerchantPayout, so nothing reached the bank; its balance \(1,074\.00\) is carried to batch 21.*ties \(activity 74\.00\)/);
});

test("Adyen sample layout: a carried batch that does not tie is reported", () => {
  const r = readPayoutReport(report(
    r64({ date: "2026-04-01", type: "Balancetransfer", nc: "1000.00", batch: "20", mmref: "Balancetransfer from batch 19" }),
    sale("S1", "2026-04-02", "49.60", "20"),
    r64({ date: "2026-04-03", type: "Balancetransfer", nd: "1050.00", batch: "20", mmref: "Balancetransfer to batch 21" }),
  ));
  assert.match(r.problems.join("\n"), /Batch 20: carried in 1,000\.00 \+ activity 49\.60 - carried out 1,050\.00 = -0\.40, but the payout is 0\.00/);
  assert.equal(r.payouts.length, 0);
});

test("Adyen sample layout: chained batches merge, so the payout that reaches the bank splits into every sale behind it", () => {
  const rep = readPayoutReport(report(
    sale("S1", "2026-04-02", "49.60", "20"),
    r64({ date: "2026-04-03", type: "Balancetransfer", nd: "49.60", batch: "20", mmref: "Balancetransfer to batch 21" }),
    r64({ date: "2026-04-04", type: "Balancetransfer", nc: "49.60", batch: "21", mmref: "Balancetransfer from batch 20" }),
    sale("S2", "2026-04-05", "24.60", "21"),
    r64({ date: "2026-04-06", type: "MerchantPayout", nd: "74.20", batch: "21", mmref: "TX1XT batch 21" }),
  ));
  assert.deepEqual(rep.problems, []);
  assert.equal(rep.payouts.length, 1);
  const p = rep.payouts[0];
  assert.equal(p.id, "21");
  assert.equal(p.net, 7420);
  assert.deepEqual(p.rows.map((x) => x.id).sort(), ["S1", "S2"]);
  const plan = planPayouts(books([["2026-04-07", "ADYEN TX1XT batch 21", "74.20"]]), rep);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 7500 }, { account: "6010", cents: -80 }]);
});

test("Adyen sample layout: a balance carried in from a batch not in the export goes to the processor balance, named", () => {
  const rep = readPayoutReport(report(
    r64({ date: "2026-04-04", type: "Balancetransfer", nc: "100.00", batch: "21", mmref: "Balancetransfer from batch 20" }),
    sale("S2", "2026-04-05", "24.60", "21"),
    r64({ date: "2026-04-06", type: "MerchantPayout", nd: "124.60", batch: "21" }),
  ));
  assert.equal(rep.payouts.length, 1);
  assert.match(rep.problems.join("\n"), /Batch 21: 100\.00 was carried in from batch 20, which is not in this export; .*processor balance \(reserve\)/);
  const b = books([["2026-04-07", "ADYEN", "124.60"]]);
  const plan = planPayouts(b, rep);
  assert.deepEqual(plan.matched[0].parts.sort((x, y) => x.account.localeCompare(y.account)), [{ account: "1200", cents: 10000 }, { account: "4000", cents: 2500 }, { account: "6010", cents: -40 }]);
});

test("Adyen journal types: deposit and reserve moves are not income, failed captures and reversed settlements reduce sales, failed refunds undo refunds", () => {
  const r = readPayoutReport(report(
    sale("S1", "2026-04-02", "100.00", "30"),
    r64({ psp: "D1", date: "2026-04-02", type: "DepositCorrection", nd: "10.00", batch: "30" }),
    r64({ psp: "R1", date: "2026-04-02", type: "ReserveAdjustment", nc: "5.00", batch: "30" }),
    r64({ psp: "C1", date: "2026-04-02", type: "CaptureFailed (Sales day payout)", nd: "20.00", batch: "30" }),
    r64({ psp: "V1", date: "2026-04-02", type: "SettledReversed", nd: "3.00", batch: "30" }),
    r64({ psp: "F1", date: "2026-04-02", type: "RefundFailed (Sales day payout)", nc: "4.00", batch: "30" }),
    r64({ psp: "P1", date: "2026-04-02", type: "PaidOut", nd: "1.00", batch: "30" }),
    r64({ date: "2026-04-03", type: "MerchantPayout", nd: "75.00", batch: "30" }),
  ));
  const kind = Object.fromEntries(r.rows.map((x) => [x.id, x.kind]));
  assert.deepEqual(kind, { S1: "sales", D1: "reserve", R1: "reserve", C1: "sales", V1: "sales", F1: "refunds", P1: "other" });
  assert.equal(r.payouts.length, 1);
  assert.match(r.problems.join("\n"), /"PaidOut" rows \(-1\.00\) are money Adyen moved that is not a sale, cost or payout/);
});
