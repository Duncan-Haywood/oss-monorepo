import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeRows, analyze, parseCosts, sampleCsv, sampleCosts } from "./calc.mjs";

const load = (text, opts) => {
  const n = normalizeRows(parseCsv(text));
  assert.equal(n.error, null);
  return { n, r: analyze(n.rows, opts) };
};

test("parseDate reads Amazon's date styles and month-first slashes", () => {
  assert.deepEqual(parseDate("Sep 1, 2025 3:04:05 AM PDT"), { y: 2025, mo: 8, d: 1 });
  assert.deepEqual(parseDate("1 Sep 2025 03:04:05 UTC"), { y: 2025, mo: 8, d: 1 });
  assert.deepEqual(parseDate("2025-09-01T03:04:05Z"), { y: 2025, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2025"), { y: 2025, mo: 8, d: 30 });
  assert.equal(parseDate("garbage"), null);
});

test("parseMoney handles thousands separators, parentheses and European decimals", () => {
  assert.equal(parseMoney("1,234.56"), 1234.56);
  assert.equal(parseMoney("-$3.22"), -3.22);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("12,5"), 12.5);
  assert.equal(parseMoney(""), 0);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("preamble lines above the header are skipped", () => {
  const csv = '"Includes Amazon Marketplace, Fulfillment by Amazon (FBA), and Amazon Webstore transactions"\n"All amounts in USD"\n"date/time","type","sku","description","quantity","product sales","selling fees","fba fees","total"\n"Sep 1, 2025 3:04:05 AM PDT","Order","A","x","1","10.00","-1.50","-3.00","5.50"';
  const { n } = load(csv);
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].total, 5.5);
});

test("missing columns give a helpful error, unreadable rows are listed with line numbers", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("type,sku\nOrder,A")).error, /No header row|date/);
  const csv = '"date/time","type","sku","quantity","product sales","total"\n"nope","Order","A","1","10","10"\n"Sep 1, 2025 1:00:00 AM PDT","Order","A","1","x","10"\n"Sep 1, 2025 1:00:00 AM PDT","Order","A","1","10","10"';
  const n = normalizeRows(parseCsv(csv));
  assert.equal(n.rows.length, 1);
  assert.equal(n.skipped.length, 2);
  assert.equal(n.skipped[0].line, 2);
});

test("per-SKU proceeds equal the sum of the file's totals and the waterfall reconciles", () => {
  const { n, r } = load(sampleCsv());
  const skuSum = r.skus.reduce((a, s) => a + s.netProceeds, 0);
  const orderRefundTotals = n.rows.filter((x) => x.typeKey === "order" || x.typeKey === "refund").reduce((a, x) => a + x.total, 0);
  assert.ok(Math.abs(skuSum - orderRefundTotals) < 0.01);
  const s = r.summary;
  // gross + promo + refunds' effect + fees == net proceeds
  const built = s.gross + s.promo + s.referral + s.fba + s.otherFees + s.refundAmount + s.refundReferralBack;
  assert.ok(Math.abs(built - s.netProceeds) < 0.01, `${built} vs ${s.netProceeds}`);
  const monthNet = r.months.reduce((a, m) => a + m.net, 0);
  assert.ok(Math.abs(monthNet - (s.netProceeds + s.accountTotal)) < 0.01);
});

test("transfers are payouts, not costs", () => {
  const { r } = load(sampleCsv());
  assert.ok(r.summary.payouts < 0);
  const total = r.summary.netProceeds + r.summary.accountTotal;
  assert.ok(Math.abs(r.summary.operating - total) < 0.001);
});

test("account rows are bucketed: ads, subscription, storage, reimbursement", () => {
  const { r } = load(sampleCsv());
  const a = r.summary.account;
  assert.ok(a.advertising < 0 && a.subscription < 0 && a["fba-inventory"] < 0);
  assert.equal(a.reimbursement, 62.4);
  assert.equal(r.summary.reimbursementCount, 1);
});

test("unit costs produce profit only for costed SKUs and never treat missing cost as free", () => {
  const { r } = load(sampleCsv(), { costs: { "KITCHEN-SCALE-BLK": 4.1 } });
  const scale = r.skus.find((s) => s.sku === "KITCHEN-SCALE-BLK");
  const mat = r.skus.find((s) => s.sku === "YOGA-MAT-6MM");
  assert.ok(scale.profit !== null && mat.profit === null);
  assert.equal(r.summary.allCosted, false);
  assert.ok(Math.abs(scale.cogs - 4.1 * scale.netUnits) < 0.001);
  assert.ok(r.findings.some((f) => /no unit cost/i.test(f.title)));
});

test("returnsResellable=false charges cost on refunded units too", () => {
  const costs = { "YOGA-MAT-6MM": 9.5 };
  const a = load(sampleCsv(), { costs, returnsResellable: true }).r.skus.find((s) => s.sku === "YOGA-MAT-6MM");
  const b = load(sampleCsv(), { costs, returnsResellable: false }).r.skus.find((s) => s.sku === "YOGA-MAT-6MM");
  assert.ok(b.cogs > a.cogs);
  assert.ok(Math.abs(b.cogs - 9.5 * b.unitsSold) < 0.001);
});

test("refund admin fee is the referral fee Amazon kept, matched by order id", () => {
  const csv = '"date/time","type","order id","sku","quantity","product sales","selling fees","fba fees","total"\n'
    + '"Sep 1, 2025 1:00:00 AM PDT","Order","O1","A","1","20.00","-3.00","-4.00","13.00"\n'
    + '"Sep 5, 2025 1:00:00 AM PDT","Refund","O1","A","1","-20.00","2.40","0","-17.60"';
  const { r } = load(csv);
  assert.ok(Math.abs(r.summary.refundAdminKept - 0.6) < 1e-9);
  assert.equal(r.summary.refundAdminOrders, 1);
  assert.ok(r.findings.every((f) => !/kept/.test(f.title)), "under $1 is not worth a finding");
});

test("findings flag high ad spend, high refunds and loss-makers", () => {
  const { r } = load(sampleCsv(), { costs: { "KITCHEN-SCALE-BLK": 4.1, "YOGA-MAT-6MM": 25, "PHONE-STAND-ALU": 3.05, "LED-DESK-LAMP": 10.6 } });
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /lose money after cost of goods/);
  assert.match(titles, /10%\+ of units refunded/);
  assert.match(titles, /reimbursements received/);
  assert.equal(r.findings[0].severity, "high");
});

test("parseCosts accepts a header, quoted SKUs with commas, and reports bad lines", () => {
  const { costs, bad } = parseCosts('sku,cost\nA,4.10\n"B,1",$5\nC\nD,-1\nE,abc');
  assert.deepEqual(costs, { A: 4.1, "B,1": 5 });
  assert.deepEqual(bad, [4, 5, 6]);
});

test("empty and one-type files do not crash", () => {
  assert.equal(analyze([]).invalid, "No usable rows.");
  const csv = '"date/time","type","description","total"\n"Sep 1, 2025 1:00:00 AM PDT","Service Fee","Subscription","-39.99"';
  const { r } = load(csv);
  assert.equal(r.summary.skuCount, 0);
  assert.equal(r.summary.account.subscription, -39.99);
});
