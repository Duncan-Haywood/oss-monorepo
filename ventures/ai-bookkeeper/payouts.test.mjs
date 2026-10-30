import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("a PayPal activity CSV is grouped under each withdrawal, fees read as negatives", () => {
  const pp = `Date,Time,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID
03/01/2026,10:00:00,Ann,Website Payment,Completed,USD,100.00,-3.20,96.80,T1
03/02/2026,11:00:00,Bob,Express Checkout Payment,Completed,USD,50.00,-1.75,48.25,T2
03/02/2026,12:00:00,Bob,Payment Refund,Completed,USD,-10.00,0.00,-10.00,T3
03/03/2026,09:00:00,Cy,Website Payment,Pending,USD,70.00,-2.00,68.00,T4
03/04/2026,09:00:00,Bank,General Withdrawal,Completed,USD,-135.05,0.00,-135.05,W1
03/05/2026,09:00:00,Dee,Website Payment,Completed,USD,20.00,-0.88,19.12,T5
`;
  const r = readPayoutReport(pp);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 13505);
  assert.equal(r.pending.length, 1);
  const plan = planPayouts(books([["2026-03-05", "PAYPAL TRANSFER", "135.05"]]), r);
  assert.equal(plan.matched.length, 1);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 14000 }, { account: "6010", cents: -495 }]);
});

test("a PayPal withdrawal that includes a carried-over balance is not split", () => {
  const pp = `Date,Time,Type,Status,Gross,Fee,Net,Transaction ID
03/01/2026,10:00:00,Website Payment,Completed,100.00,-3.00,97.00,T1
03/04/2026,09:00:00,General Withdrawal,Completed,-150.00,0.00,-150.00,W1
`;
  const r = readPayoutReport(pp);
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /carried over/);
});

test("a Square layout (negative fees, net total) splits into sales, refunds and fees", () => {
  const r = readPayoutReport(`Payout ID,Payout Date,Payment ID,Payment Date,Type,Gross Sales,Fees,Net Total
d1,2026-03-05,p1,2026-03-03,Card,100.00,-3.20,96.80
d1,2026-03-05,p2,2026-03-04,Refund,-20.00,0.00,-20.00
`);
  assert.equal(r.payouts[0].net, 7680);
  const plan = planPayouts(books([["2026-03-06", "SQUARE INC", "76.80"]]), r);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 8000 }, { account: "6010", cents: -320 }]);
});

test("Stripe's FX, tax and Climate categories are costs, not other income", () => {
  const r = readPayoutReport(`${HEAD}\npo_7,2026-03-05,t1,2026-03-01,stripe_fx_fee,-2.00,0.00,-2.00,FX\npo_7,2026-03-05,t2,2026-03-01,tax_fee,-1.00,0.00,-1.00,Tax\npo_7,2026-03-05,t3,2026-03-01,contribution,-1.00,0.00,-1.00,Climate\npo_7,2026-03-05,t4,2026-03-01,partial_capture_reversal,-5.00,0.00,-5.00,x\n`);
  assert.deepEqual(r.rows.map((x) => x.kind), ["fees", "fees", "fees", "refunds"]);
});

test("an Amazon settlement (flat file V2) splits into sales, refunds, tax, ads and fees", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("./fixtures/amazon-settlement-v2.txt", import.meta.url), "utf8");
  const r = readPayoutReport(text);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "9100001");
  assert.equal(p.date, "2026-03-05");
  assert.equal(p.net, 35016);
  const plan = planPayouts(books([["2026-03-05", "AMAZON.COM SERVICES DEPOSIT", "350.16"]]), r);
  assert.equal(plan.matched.length, 1);
  const by = Object.fromEntries(plan.matched[0].parts.map((x) => [x.account, x.cents]));
  // sales 100+5+400 less refund 20 and promotion 5, tax nets to zero (left out), ads -25, fees -15.75-3.5-60+3-0.6-39.99, reimbursement +12
  assert.deepEqual(by, { 4000: 48000, 6000: -2500, 6010: -11684, 4100: 1200 });
  const applied = applyPayouts(books([["2026-03-05", "AMAZON.COM SERVICES DEPOSIT", "350.16"]]), plan);
  assert.equal(applied.posted, 1);
});

test("an Amazon settlement that does not add up, or holds a reserve, is not split", () => {
  const head = "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tamount-type\tamount-description\tamount";
  const bad = `${head}\nS1\t\t\t2026-03-05\t100.00\tUSD\t\t\t\t\t\nS1\t\t\t\t\t\tOrder\tA\tItemPrice\tPrincipal\t90.00\n`;
  const r = readPayoutReport(bad);
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /add up to \$?90\.00|90\.00/);
  const res = `${head}\nS2\t\t\t2026-03-05\t100.00\tUSD\t\t\t\t\t\nS2\t\t\t\t\t\tOrder\tA\tItemPrice\tPrincipal\t110.00\nS2\t\t\t\t\t\tother-transaction\t\tother-transaction\tCurrent Reserve Amount\t-10.00\n`;
  const r2 = readPayoutReport(res);
  assert.equal(r2.payouts.length, 0);
  assert.match(r2.problems[0], /reserve/);
});

test("an Amazon date-range transaction CSV splits by settlement, with the transfer as the deposit", async () => {
  const { readFileSync } = await import("node:fs");
  const r = readPayoutReport(readFileSync(new URL("./fixtures/amazon-date-range.csv", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].id, "9200001");
  assert.equal(r.payouts[0].date, "2026-03-10");
  assert.equal(r.payouts[0].net, 39075);
  assert.equal(r.pending.length, 2); // settlement 9200002 has no transfer yet
  const plan = planPayouts(books([["2026-03-10", "AMAZON.COM SERVICES DEPOSIT", "390.75"]]), r);
  assert.equal(plan.matched.length, 1);
  const by = Object.fromEntries(plan.matched[0].parts.map((x) => [x.account, x.cents]));
  // sales 100+5+400, refund -20 and rebate -5, tax nets to zero, ads -25, fees -15.75-3.5-60+3, reimbursement +12
  assert.deepEqual(by, { 4000: 48000, 6000: -2500, 6010: -7625, 4100: 1200 });
  assert.equal(Object.values(by).reduce((a, b) => a + b, 0), 39075);
});

test("an Amazon date-range row whose columns do not add up to its total is refused", () => {
  const head = '"date/time","settlement id","type","order id","product sales","selling fees","total"';
  const r = readPayoutReport(`"note"\n${head}\n"Mar 2, 2026 9:15:02 AM PST","S1","Order","A","100.00","-15.00","90.00"\n"Mar 3, 2026 9:15:02 AM PST","S1","Transfer","","0","0","-90.00"\n`);
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /add up to 85\.00|85\.00/);
});

test("Square Payouts API entries split a payout; fees may be signed either way", async () => {
  const { readFileSync } = await import("node:fs");
  const r = readPayoutReport(readFileSync(new URL("./fixtures/square-payout-entries.json", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].id, "po_sq1");
  assert.equal(r.payouts[0].date, "2026-03-06");
  assert.equal(r.payouts[0].net, 14535 - 5000 - 2900);
  assert.equal(r.pending.length, 1); // e4 not in a payout yet
  const plan = planPayouts(books([["2026-03-06", "SQUARE INC TRANSFER", "66.35"]]), r);
  assert.equal(plan.matched.length, 1);
  const by = Object.fromEntries(plan.matched[0].parts.map((x) => [x.account, x.cents]));
  assert.deepEqual(by, { 4000: 10000, 6010: -3365 });
});

test("Square ActivityType names classify by meaning: fee refunds are fees, holds and loans are not income", () => {
  const e = (type, amount) => ({ payout_id: "p", type, effective_at: "2026-03-04T15:00:00Z", gross_amount_money: { amount }, fee_amount_money: { amount: 0 }, net_amount_money: { amount } });
  const kinds = Object.fromEntries(["CHARGE", "REFUND", "PROCESSING_FEE_REFUND", "APP_FEE_REVENUE", "RESERVE_HOLD", "SQUARE_CAPITAL_PAYMENT", "OPEN_DISPUTE", "PAYOUT", "TAX_ON_FEE", "ESCHEATMENT", "PERCENTAGE_PROCESSING_ENROLLMENT", "PERCENTAGE_PROCESSING_DEACTIVATION", "LOCAL_OFFERS_FEE", "SOMETHING_NEW"].map((t) => [t, readPayoutReport(JSON.stringify({ payout_entries: [e(t, 100)] })).rows[0].kind]));
  assert.deepEqual(kinds, { CHARGE: "sales", REFUND: "refunds", PROCESSING_FEE_REFUND: "fees", APP_FEE_REVENUE: "sales", RESERVE_HOLD: "reserve", SQUARE_CAPITAL_PAYMENT: "reserve", OPEN_DISPUTE: "disputes", PAYOUT: "skip", TAX_ON_FEE: "fees", ESCHEATMENT: "reserve", PERCENTAGE_PROCESSING_ENROLLMENT: "reserve", PERCENTAGE_PROCESSING_DEACTIVATION: "reserve", LOCAL_OFFERS_FEE: "fees", SOMETHING_NEW: "other" });
});

test("a Square entry whose net fits neither fee sign is refused", () => {
  const r = readPayoutReport(JSON.stringify({ payout_entries: [{ payout_id: "p", type: "CHARGE", gross_amount_money: { amount: 1000 }, fee_amount_money: { amount: 30 }, net_amount_money: { amount: 900 } }] }));
  assert.equal(r.payouts.length, 0);
  assert.equal(r.problems.length, 1);
});

test("Stripe reserved funds go to the clearing asset, not other income, and a release comes back", () => {
  const r = readPayoutReport(`${HEAD}\npo_8,2026-03-05,t1,2026-03-01,charge,500.00,15.00,485.00,Order\npo_8,2026-03-05,t2,2026-03-02,risk_reserved_funds,-100.00,0.00,-100.00,Hold\npo_9,2026-03-12,t3,2026-03-10,risk_reserved_funds,100.00,0.00,100.00,Release\n`);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sales", "reserve", "reserve"]);
  const plan = planPayouts(books([["2026-03-05", "STRIPE", "385.00"], ["2026-03-12", "STRIPE", "100.00"]]), r);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 50000 }, { account: "6010", cents: -1500 }, { account: "1200", cents: -10000 }]);
  assert.deepEqual(plan.matched[1].parts, [{ account: "1200", cents: 10000 }]);
});

test("a full-width Shopify payout transactions export: dispute fees are fees, the payout row is skipped, unpaid rows are pending", () => {
  const shop = `Transaction Date,Type,Order ID,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Available On,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,Vat,Business Entity Name
2026-03-01 10:00:00 -0500,charge,1001,visa,online,paid,2026-03-04,555,2026-03-04,100.00,3.20,96.80,c1,visa,100.00,USD,USD,,Acme
2026-03-02 10:00:00 -0500,refund,1001,visa,online,paid,2026-03-04,555,2026-03-04,-20.00,0.00,-20.00,c1,visa,-20.00,USD,USD,,Acme
2026-03-02 11:00:00 -0500,chargeback_fee,1002,visa,online,paid,2026-03-04,555,2026-03-04,-15.00,0.00,-15.00,c2,visa,,USD,USD,,Acme
2026-03-03 11:00:00 -0500,chargeback,1002,visa,online,paid,2026-03-04,555,2026-03-04,-50.00,0.00,-50.00,c2,visa,,USD,USD,,Acme
2026-03-04 11:00:00 -0500,payout,,,,paid,2026-03-04,555,2026-03-04,-11.80,0.00,-11.80,,,,USD,USD,,Acme
2026-03-05 11:00:00 -0500,charge,1003,visa,online,pending,,,2026-03-08,10.00,0.59,9.41,c3,visa,10.00,USD,USD,,Acme
`;
  const r = readPayoutReport(shop);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 1180);
  assert.equal(r.pending.length, 1);
  const plan = planPayouts(books([["2026-03-05", "SHOPIFY", "11.80"]]), r, {});
  assert.equal(plan.matched.length, 1);
  assert.ok(!plan.matched[0].parts.some((x) => x.account === "4100"), "dispute fees are not other income");
  assert.equal(plan.matched[0].parts.reduce((a, x) => a + x.cents, 0), 1180);
});

test("an Etsy payment-account ledger is grouped under each deposit, newest first", () => {
  const e = `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
"March 5, 2026",Deposit,Deposit to bank,,USD,--,--,-$99.30,
"March 4, 2026",Fee,Listing fee,,USD,--,--,-$0.20,
"March 3, 2026",Refund,Refund to buyer,Order #3,USD,-$10.00,--,-$10.00,
"March 2, 2026",Sale,Payment for Order #2,,USD,$50.00,-$2.50,$47.50,
"March 1, 2026",Sale,Payment for Order #1,,USD,$65.00,-$3.00,$62.00,
"March 6, 2026",Sale,Payment for Order #4,,USD,$20.00,-$1.00,$19.00,
`;
  const r = readPayoutReport(e);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 9930);
  assert.equal(r.payouts[0].gross, 10500);
  assert.equal(r.payouts[0].fees, 570);
  assert.equal(r.pending.length, 1);
});

test("an Etsy returned deposit or recoupment is flagged, not booked as a fee, and the deposit after it still splits", () => {
  const e = `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
"March 5, 2026",Deposit,Deposit to bank,,USD,--,--,-$157.00,
"March 4, 2026",Sale,Payment for Order #2,,USD,$100.00,-$5.00,$95.00,
"March 3, 2026",Returned disbursement,Deposit returned by bank,,USD,--,--,$62.00,
"March 2, 2026",Deposit,Deposit to bank,,USD,--,--,-$62.00,
"March 1, 2026",Sale,Payment for Order #1,,USD,$65.00,-$3.00,$62.00,
`;
  const r = readPayoutReport(e);
  assert.equal(r.problems.length, 1);
  assert.equal(r.payouts.length, 2);
  assert.equal(r.payouts[1].net, 15700);
  assert.match(r.problems[0], /Row 4.*Returned disbursement.*book it against the bank/);
});

test("the Etsy fixture behind etsy-bookkeeping.html splits one deposit as the page says", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/etsy-ledger.csv", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.net, 31509);
  assert.equal(p.gross, 36150);
  assert.equal(p.fees, 4641);
});

test("the eBay fixture behind ebay-bookkeeping.html splits one payout as the page says", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/ebay-transactions.csv", import.meta.url), "utf8"));
  const p = r.payouts[0];
  assert.equal(p.net, 11170);
  assert.equal(p.gross, 14000);
  assert.equal(p.fees, 2830);
  const sum = (k) => p.rows.filter((x) => x.kind === k).reduce((a, x) => a + x.gross, 0);
  assert.equal(sum("sales"), 14500);
  assert.equal(sum("refunds"), -1000);
  assert.equal(sum("tax"), 500);
  assert.equal(p.rows.filter((x) => x.kind === "sales").reduce((a, x) => a + x.fee, 0), 2010);
  assert.equal(r.pending[0].net, 2610);
  const page = readFileSync(new URL("./ebay-bookkeeping.html", import.meta.url), "utf8");
  for (const t of ["$145.00", "$135.00", "$20.10", "$8.20", "$5.00", "$111.70", "$106.70", "$28.30"]) assert.ok(page.includes(t), t);
});

test("Stripe's balance-transactions export (Type, Amount, Created (UTC), Automatic Payout ID) splits a payout", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/stripe-balance-transactions.csv", import.meta.url), "utf8"));
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "po_9");
  assert.equal(p.net, 6130);
  assert.equal(p.date, "2026-03-04");
  assert.equal(p.fees, 320);
  assert.deepEqual(r.rows.filter((x) => x.kind === "skip").length, 1);
});

test("the Shopify fixture behind shopify-bookkeeping.html splits two payouts as the page says", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/shopify-payout-transactions.csv", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 2);
  assert.equal(r.pending.length, 1);
  const plan = planPayouts(books([["2026-05-07", "SHOPIFY PAYOUT", "213.11"], ["2026-05-14", "SHOPIFY PAYOUT", "205.44"]]), r, {});
  assert.equal(plan.matched.length, 2);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 22150 }, { account: "6010", cents: -839 }]);
  assert.deepEqual(plan.matched[1].parts, [{ account: "4000", cents: 27400 }, { account: "6010", cents: -6856 }]);
  const sales = plan.matched.reduce((a, m) => a + m.parts[0].cents, 0);
  const costs = plan.matched.reduce((a, m) => a - m.parts[1].cents, 0);
  assert.equal(sales, 49550);
  assert.equal(costs, 7695);
  assert.equal(sales - costs, 41855);
});

test("the Square and PayPal fixtures behind square-bookkeeping.html and paypal-bookkeeping.html split as the pages say", () => {
  const sq = readPayoutReport(readFileSync(new URL("./fixtures/square-transactions.csv", import.meta.url), "utf8"));
  const sp = planPayouts(books([["2026-03-05", "SQUARE INC", "9.36"]]), sq, {}).matched[0].parts;
  const by = (a) => sp.find((x) => x.account === a).cents;
  assert.deepEqual([by("4000"), by("2100"), by("6010")], [1000, 63, -127]);
  assert.equal(by("4000") + by("2100") + by("6010"), 936);
  const pp = readPayoutReport(readFileSync(new URL("./fixtures/paypal-activity.csv", import.meta.url), "utf8"));
  assert.deepEqual(pp.problems, []);
  const pm = planPayouts(books([["2026-03-04", "PAYPAL TRANSFER", "145.05"]]), pp, {}).matched[0].parts;
  assert.deepEqual(pm, [{ account: "4000", cents: 15000 }, { account: "6010", cents: -495 }]);
  for (const [f, figs] of [["square-bookkeeping.html", ["$9.36", "$10.00", "$0.63", "$1.27"]], ["paypal-bookkeeping.html", ["$145.05", "$150.00", "$4.95"]]]) {
    const html = readFileSync(new URL("./" + f, import.meta.url), "utf8");
    for (const x of figs) assert.ok(html.includes(x), f + " lacks " + x);
    assert.ok(html.includes("No warranty"));
  }
});

test("creator-platform column and category names (Gumroad, Paddle, Lemon Squeezy style) read through the aliases", () => {
  const r = readPayoutReport("payout_reference,payout_date,transaction_id,date,type,sale_price,platform_fee,payout_amount\nPR-7,2026-04-01,t1,2026-03-28,purchase,29.00,3.15,25.85\nPR-7,2026-04-01,t2,2026-03-29,subscription_payment,49.00,4.90,44.10\nPR-7,2026-04-01,t3,2026-03-30,refund,-29.00,0.00,-29.00\n");
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].net, 2585 + 4410 - 2900);
  assert.equal(r.payouts[0].fees, 315 + 490);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sales", "sales", "refunds"]);
});

test("the Airbnb fixture behind airbnb-bookkeeping.html splits one payout as the page says", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/airbnb-transactions.csv", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.net, 195150);
  assert.equal(p.gross, 195000);
  assert.equal(p.rows.filter((x) => x.kind === "sales").length, 3);
  assert.equal(p.rows.filter((x) => x.kind === "sales").reduce((a, x) => a + x.fee, 0), 5850);
  assert.equal(p.rows.find((x) => x.kind === "other").net, 6000);
});

test("an Airbnb payout that does not match the rows before it is reported, not split", () => {
  const r = readPayoutReport(`Date,Type,Confirmation code,Listing,Amount,Paid out,Host fee,Gross earnings
06/04/2026,Reservation,HM1,Cabin,$97.00,,$3.00,$100.00
06/10/2026,Payout,,,,$150.00,,
`);
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /Not split/);
});

test("Connect platform earnings are sales and a top-up or reversed payout is clearing, not other income", () => {
  const rep = `${HEAD}
po_9,2026-04-05,txn_1,2026-04-01,platform_earning,100.00,0.00,100.00,Platform cut
po_9,2026-04-05,txn_2,2026-04-02,platform_earning_refund,-10.00,0.00,-10.00,Cut refunded
po_9,2026-04-05,txn_3,2026-04-03,topup,200.00,0.00,200.00,Top-up from bank
po_9,2026-04-05,txn_4,2026-04-03,anticipation_repayment,-30.00,0.00,-30.00,Advance repaid
`;
  const r = readPayoutReport(rep);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sales", "refunds", "reserve", "reserve"]);
  const plan = planPayouts(books([["2026-04-06", "STRIPE PAYOUT", "260.00"]]), r);
  assert.equal(plan.matched.length, 1);
  assert.deepEqual(plan.matched[0].parts, [{ account: "4000", cents: 9000 }, { account: "1200", cents: 17000 }]);
});

test("Stripe reporting categories added from the reference: holds and releases are clearing, Climate is a fee", () => {
  const rep = `${HEAD}
po_8,2026-04-05,txn_1,2026-04-01,charge,100.00,3.20,96.80,Sale
po_8,2026-04-05,txn_2,2026-04-02,payout_minimum_balance_hold,-20.00,0.00,-20.00,Hold
po_8,2026-04-05,txn_3,2026-04-02,payment_network_reserve_release,5.00,0.00,5.00,Release
po_8,2026-04-05,txn_4,2026-04-03,climate_order_purchase,-1.00,0.00,-1.00,Climate
po_8,2026-04-05,txn_5,2026-04-03,charge_failure,-10.00,0.00,-10.00,Failed
`;
  const r = readPayoutReport(rep);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sales", "reserve", "reserve", "fees", "refunds"]);
});

test("Shopify Payments transaction types from the Admin reference: costs are fees, loans and transfers are clearing", () => {
  const rep = `Transaction Date,Type,Order,Amount,Fee,Net,Payout Date,Payout ID
2026-04-01,charge,#1,100.00,3.20,96.80,2026-04-03,5
2026-04-01,shipping_label,#1,-8.00,0.00,-8.00,2026-04-03,5
2026-04-02,referral_fee,#2,-2.00,0.00,-2.00,2026-04-03,5
2026-04-02,lending_credit_remittance,,-15.00,0.00,-15.00,2026-04-03,5
2026-04-02,merchant_to_merchant_credit,,10.00,0.00,10.00,2026-04-03,5
2026-04-02,seller_protection_credit,#3,12.00,0.00,12.00,2026-04-03,5
2026-04-02,anomaly_credit,,1.00,0.00,1.00,2026-04-03,5
`;
  const r = readPayoutReport(rep);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sales", "fees", "fees", "reserve", "reserve", "disputes", "other"]);
});

test("Stripe currency_conversion is a balance movement, not other income", () => {
  const rep = `${HEAD}
po_7,2026-04-05,txn_1,2026-04-01,charge,100.00,3.20,96.80,Sale
po_7,2026-04-05,txn_2,2026-04-02,currency_conversion,-50.00,0.00,-50.00,Converted out
`;
  assert.deepEqual(readPayoutReport(rep).rows.map((x) => x.kind), ["sales", "reserve"]);
});

test("Stripe types from the OpenAPI list: bank inflows and tax funds are clearing, a reversed payment is a refund", () => {
  const rep = `${HEAD}
po_8,2026-04-05,txn_1,2026-04-01,charge,100.00,3.20,96.80,Sale
po_8,2026-04-05,txn_2,2026-04-02,inbound_transfer,50.00,0.00,50.00,ACH in
po_8,2026-04-05,txn_3,2026-04-02,tax_fund,-5.00,0.00,-5.00,Tax set aside
po_8,2026-04-05,txn_4,2026-04-03,payment_reversal,-20.00,0.00,-20.00,Reversed
po_8,2026-04-05,txn_5,2026-04-03,obligation_outbound,-1.00,0.00,-1.00,Unknown
`;
  assert.deepEqual(readPayoutReport(rep).rows.map((x) => x.kind), ["sales", "reserve", "reserve", "refunds", "other"]);
});

test("Square dashboard transactions CSV: deposit id groups payments and refunds, fees are negatives", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/square-transactions.csv", import.meta.url), "utf8"));
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "dep_1");
  assert.equal(p.date, "2026-03-04");
  assert.equal(p.net, 1003 + 1217 - 1284);
  assert.equal(p.fees, 60 + 67);
  assert.deepEqual(p.rows.map((x) => x.kind), ["sales", "tax", "tips", "sales", "tax", "refunds", "tax"]);
  assert.equal(r.pending.length, 2);
  // Tax and tip come out of Total Collected: $9.00 of coffee, not $10.63.
  const plan = planPayouts(books([["2026-03-05", "SQUARE INC", "9.36"]]), r, {});
  assert.deepEqual([...plan.matched[0].parts].sort((a, b) => a.account.localeCompare(b.account)), [{ account: "2100", cents: 63 }, { account: "4000", cents: 1000 }, { account: "6010", cents: -127 }]);
});

test("Square tips follow --tips when given; tax goes to sales tax payable", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/square-transactions.csv", import.meta.url), "utf8"));
  const b = books([["2026-03-05", "SQUARE INC", "9.36"]]);
  b.accounts.push({ code: "2300", name: "Payroll liabilities", type: "liability" });
  const plan = planPayouts(b, r, { tips: "2300" });
  assert.deepEqual(plan.matched[0].parts.find((x) => x.account === "2300"), { account: "2300", cents: 100 });
  assert.equal(plan.matched[0].parts.find((x) => x.account === "4000").cents, 900);
});

test("quirk probe: currency in the amount headers is read, a mixed-currency report is flagged", () => {
  const rows = "po_1,2026-03-05,txn_a,2026-03-02,charge,500.00,14.80,485.20,USD\npo_1,2026-03-05,txn_b,2026-03-03,charge,10.00,1.00,9.00,EUR";
  const r = readPayoutReport(`automatic_payout_id,automatic_payout_effective_at,balance_transaction_id,created,reporting_category,Gross (USD),Fee (USD),Net (USD),currency\n${rows}`);
  assert.equal(r.payouts[0].net, 49420);
  assert.match(r.problems[0], /mixes currencies \(EUR, USD\)/);
  const one = readPayoutReport(`automatic_payout_id,automatic_payout_effective_at,balance_transaction_id,created,reporting_category,gross,fee,net,currency\n${rows.split("\n")[0]}`);
  assert.deepEqual(one.problems, []);
});

test("eBay's Seller Hub transaction report splits a payout, takes seller-collected tax out of sales and leaves an unpaid order pending", () => {
  const r = readPayoutReport(readFileSync(new URL("./fixtures/ebay-transactions.csv", import.meta.url), "utf8"));
  assert.equal(r.source, "ebay");
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  const p = r.payouts[0];
  assert.equal(p.id, "PO-1001");
  assert.equal(p.date, "2026-04-08");
  assert.equal(p.net, 11170);
  assert.equal(p.rows.find((x) => x.kind === "tax").gross, 500);
  assert.equal(p.rows.filter((x) => x.kind === "fees").reduce((a, x) => a - x.fee, 0), -820);
  assert.equal(r.pending.length, 1);
});

test("an eBay multi-item order's item-detail rows (no Type, no amounts) are not read as money", () => {
  const t = readFileSync(new URL("./fixtures/ebay-transactions.csv", import.meta.url), "utf8").replace("Vintage lens\n", "Vintage lens\n,,12-00001-11111,,,--,,,PO-1001,,,--,--,--,$40.00,--,--,Second item\n");
  const r = readPayoutReport(t);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts[0].net, 11170);
  assert.equal(r.payouts[0].rows.length, 5);
  assert.equal(r.pending.length, 1);
});

test("an eBay Payout row that disagrees with its rows is not split", () => {
  const t = readFileSync(new URL("./fixtures/ebay-transactions.csv", import.meta.url), "utf8").replace("Bank,USD,--,--,--,--,--,--,--", "Bank,USD,--,--,--,--,--,--,--").replace("$111.70,USD", "$111.71,USD");
  const r = readPayoutReport(t);
  assert.equal(r.payouts.length, 0);
  assert.match(r.problems[0], /PO-1001/);
});

test("Stripe's wide settlement layout (bracketed metadata columns, customer columns) reads and balances", () => {
  const head = "balance_transaction_id,payment_metadata[external_identifier],payment_metadata[orchestrator_tx_ref],source_id,payment_intent_id,charge_id,created,available_on,automatic_payout_effective_at,currency,gross,fee,net,reporting_category,payment_method_type,card_brand,card_country,card_funding,description,trace_id_status,gateway_account,automatic_payout_id,customer_facing_amount,customer_facing_currency,customer_name,customer_email";
  const t = `${head}
txn_1,100.1,,ch_1,pi_1,ch_1,2026-01-30 10:11:12,2026-01-30 00:00:00,2026-01-31 00:00:00,USD,25,0.95,24.05,charge,card,visa,US,credit,,pending,acct_live,po_1,25,usd,A Donor,a@example.org
txn_2,,,re_1,pi_1,ch_1,2026-01-30 12:30:00,2026-01-30 00:00:00,2026-01-31 00:00:00,USD,-10,0,-10,refund,card,visa,US,credit,,pending,acct_live,po_1,-10,usd,,
txn_3,,,,,,2026-01-30 12:30:00,2026-01-30 00:00:00,2026-01-31 00:00:00,USD,-0.5,0,-0.5,fee,,,,,Radar (2026-03-25): Standard,,,po_1,,,,
txn_4,,,po_9,,,2026-01-31 00:00:00,2026-01-31 00:00:00,2026-01-31 00:00:00,USD,-13.55,0,-13.55,payout,,,,,Payout,available,acct_live,po_1,,,,
`;
  const r = readPayoutReport(t);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].id, "po_1");
  assert.equal(r.payouts[0].net, 1355);
  assert.equal(r.problems.length, 0);
});

test("an Amazon promotion's tax line (Promotion/TaxDiscount) is tax, not a refund", () => {
  const head = "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tamount-type\tamount-description\tamount";
  const r = readPayoutReport(`${head}\nS3\t\t\t2026-03-05\t94.60\tUSD\t\t\t\t\t\nS3\t\t\t\t\t\tOrder\tA\tItemPrice\tPrincipal\t100.00\nS3\t\t\t\t\t\tOrder\tA\tPromotion\tPrincipal\t-5.00\nS3\t\t\t\t\t\tOrder\tA\tPromotion\tTaxDiscount\t-0.40\n`);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.payouts[0].rows.map((x) => x.kind), ["sales", "refunds", "tax"]);
});

test("a PayPal payment the account holder sent is not booked as a sale", () => {
  const pp = `Date,Time,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID
03/01/2026,10:00:00,Ann,Website Payment,Completed,USD,100.00,-3.20,96.80,T1
03/02/2026,11:00:00,Supplier,Express Checkout Payment,Completed,USD,-20.00,0.00,-20.00,T2
03/04/2026,09:00:00,Bank,General Withdrawal,Completed,USD,-76.80,0.00,-76.80,W1
`;
  const r = readPayoutReport(pp);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].rows.find((x) => x.id === "T2").kind, "other");
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /payment sent/);
});

test("Amazon charge and adjustment names from the SP-API Finances model book to the right kind", () => {
  const head = "settlement-id\tsettlement-start-date\tsettlement-end-date\tdeposit-date\ttotal-amount\tcurrency\ttransaction-type\torder-id\tamount-type\tamount-description\tamount";
  const names = [["Order", "ItemPrice", "TCS-CGST", "tax"], ["Order", "ItemPrice", "PaymentMethodFee", "fees"], ["Order", "ItemPrice", "Goodwill", "refunds"],
    ["Order", "ItemPrice", "GenericDeduction", "other"], ["other-transaction", "other-transaction", "PostageBilling", "fees"],
    ["other-transaction", "other-transaction", "PrivateLabelCreditCardRevenue", "other"], ["other-transaction", "other-transaction", "StoredValueCardRefund", "other"]];
  const rows = names.map(([t, a, w], i) => `S\t\t\t\t\t\t${t}\tA${i}\t${a}\t${w}\t1.00`).join("\n");
  const r = readPayoutReport(`${head}\nS\t\t\t2026-03-05\t${names.length}.00\tUSD\t\t\t\t\t\n${rows}\n`);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.payouts[0].rows.map((x) => x.kind), names.map((n) => n[3]));
});

test("the report's own payout row is checked against the rows that make it up", () => {
  const rows = (paid) => `${HEAD}
po_1,2026-03-05,txn_a,2026-03-02,charge,100.00,3.20,96.80,Order
po_1,2026-03-05,txn_b,2026-03-03,charge,50.00,1.75,48.25,Order
po_1,2026-03-05,txn_p,2026-03-05,payout,${paid},0.00,${paid},STRIPE PAYOUT
`;
  assert.deepEqual(readPayoutReport(rows("-145.05")).problems, []);
  const bad = readPayoutReport(rows("-195.05")).problems;
  assert.equal(bad.length, 1);
  assert.match(bad[0], /po_1.*195\.05.*145\.05/);
});

// Stripe's older "All transactions" export (Id, Type, Source, Amount, Fee, Net, Currency, Created (UTC),
// Available On (UTC), Description, Transfer, Transfer Date (UTC)) carries no reporting category: the payout id
// is in "Transfer", and amounts may use a decimal comma. Layout seen in a public accounting-import test suite
// (BananaAccounting/Universal, read at run time, not copied); the rows below are made up.
test("the older Stripe all-transactions export reads by its Transfer column", () => {
  const csv = [
    "id,Type,Source,Amount,Fee,Net,Currency,Created (UTC),Available On (UTC),Description,Transfer,Transfer Date (UTC)",
    'txn_p1,payout,po_1,"-90,00","0,00","-90,00",eur,2026-03-04 02:00,2026-03-09 00:00,PAYOUT,po_1,2026-03-09 00:00',
    'txn_c1,charge,ch_1,"100,00","3,50","96,50",eur,2026-03-02 07:48,2026-03-09 00:00,Order 1,po_1,2026-03-09 00:00',
    'txn_r1,reserved_funds,,"-6,50","0,00","-6,50",eur,2026-03-02 07:48,2026-03-09 00:00,Reserve,po_1,2026-03-09 00:00',
    'txn_r2,reserved_funds,,"6,50","0,00","6,50",eur,2026-03-02 07:48,2026-04-02 00:00,Reserve,,',
    'txn_c2,payment,py_2,"20,00","0,80","19,20",eur,2026-03-05 09:00,2026-03-12 00:00,Order 2,,',
  ].join("\n");
  const r = readPayoutReport(csv);
  assert.deepEqual(r.problems, []);
  assert.equal(r.payouts.length, 1);
  assert.equal(r.payouts[0].id, "po_1");
  assert.equal(r.payouts[0].net, 9000);
  assert.equal(r.payouts[0].fees, 350);
  assert.equal(r.pending.length, 2);
  // a missing row makes the payout's own row disagree and is reported
  const short = csv.split("\n").filter((l) => !l.startsWith("txn_c1")).join("\n");
  assert.equal(readPayoutReport(short).problems.length, 1);
});
