import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeTransactions, classify, originOf, walletOf, analyze, whatIfPlan, whatIfIntl, sampleData, BUCKETS } from "./calc.mjs";

const sample = () => {
  const csv = sampleData();
  const n = normalizeTransactions(parseCsv(csv));
  assert.equal(n.error, null);
  return { csv, n, r: analyze(n.rows) };
};

test("parseDate reads Shopify's timestamp, ISO, long month names and month-first slashes", () => {
  assert.deepEqual(parseDate("2026-09-01 14:03:22 -0400"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("September 1, 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2026"), { y: 2026, mo: 8, d: 30 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney handles blanks, signs, symbols and european decimals", () => {
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("-$1.20"), -1.2);
  assert.equal(parseMoney("1,234.50"), 1234.5);
  assert.equal(parseMoney("12,50"), 12.5);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("headers match case-insensitively with aliases and the file is tolerant of extra columns", () => {
  const csv = "created,TRANSACTION TYPE,order name,brand,source,gross,fees,net,Mystery\n2026-05-01,Charge,#1,Visa,domestic,100.00,3.20,96.80,x";
  const n = normalizeTransactions(parseCsv(csv));
  assert.equal(n.error, null);
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].fee, 3.2);
  assert.equal(n.rows[0].order, "#1");
});

test("fee is recovered from Net, so a negative Fee column reads the same as a positive one", () => {
  const a = normalizeTransactions(parseCsv("Transaction Date,Type,Amount,Fee,Net\n2026-05-01,charge,100,3.2,96.8")).rows[0];
  const b = normalizeTransactions(parseCsv("Transaction Date,Type,Amount,Fee,Net\n2026-05-01,charge,100,-3.2,96.8")).rows[0];
  assert.ok(Math.abs(a.fee - 3.2) < 1e-9);
  assert.ok(Math.abs(b.fee - 3.2) < 1e-9);
  const noNet = normalizeTransactions(parseCsv("Transaction Date,Type,Amount,Fee\n2026-05-01,charge,100,3.2")).rows[0];
  assert.ok(Math.abs(noNet.net - 96.8) < 1e-9);
});

test("bad files give a helpful error and unreadable rows are listed by line and reason", () => {
  assert.match(normalizeTransactions(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeTransactions([]).error, /empty/);
  const csv = "Transaction Date,Type,Amount,Fee,Net\nnope,charge,1,0,1\n2026-05-01,charge,zz,0,1\n2026-05-01,charge,10,0.5,9.5";
  const n = normalizeTransactions(parseCsv(csv));
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [2, 3]);
  assert.match(n.skipped[0].reason, /date/);
  assert.match(n.skipped[1].reason, /amount/);
});

test("classify puts each type in one bucket and tests dispute reversals before disputes", () => {
  const c = (t) => classify({ typeKey: t });
  assert.equal(c("charge"), "charge");
  assert.equal(c("refund"), "refund");
  assert.equal(c("dispute"), "dispute");
  assert.equal(c("chargeback"), "dispute");
  assert.equal(c("dispute reversal"), "dispute_won");
  assert.equal(c("chargeback won"), "dispute_won");
  assert.equal(c("adjustment"), "adjustment");
  assert.equal(c("reserve hold"), "reserve");
  assert.equal(c("payout"), "payout");
  assert.equal(c("app fee"), "other");
  assert.equal(c(""), "other");
});

test("origin and wallet are read from card source and method text", () => {
  assert.equal(originOf({ source: "international", method: "visa" }), "international");
  assert.equal(originOf({ source: "domestic", method: "visa" }), "domestic");
  assert.equal(originOf({ source: "apple pay", method: "apple pay" }), "unknown");
  assert.equal(walletOf({ source: "apple pay", method: "" }), "apple pay");
  assert.equal(walletOf({ source: "unknown", method: "paypal express" }), "paypal");
  assert.equal(walletOf({ source: "domestic", method: "visa" }), "");
});

test("every readable row lands in exactly one bucket and rows read + skipped = data rows", () => {
  const { csv, n, r } = sample();
  const dataRows = parseCsv(csv).length - 1;
  assert.equal(n.rows.length + n.skipped.length, dataRows);
  const counted = BUCKETS.reduce((a, b) => a + r.summary.buckets[b].count, 0);
  assert.equal(counted, n.rows.length);
  for (const row of n.rows) assert.ok(BUCKETS.includes(row.bucket));
});

test("the waterfall reconciles: fee and net buckets sum to the row totals and to the months", () => {
  const { n, r } = sample();
  const s = r.summary;
  const nonPayout = n.rows.filter((x) => x.bucket !== "payout");
  assert.ok(Math.abs(nonPayout.reduce((a, x) => a + x.net, 0) - s.operatingNet) < 0.01);
  assert.ok(Math.abs(nonPayout.reduce((a, x) => a + x.fee, 0) - s.totalFees) < 0.01);
  assert.ok(Math.abs(r.months.reduce((a, m) => a + m.net, 0) - s.operatingNet) < 0.01);
  assert.ok(Math.abs(r.months.reduce((a, m) => a + m.fees, 0) - s.totalFees) < 0.01);
});

test("payouts are excluded from fees and from the operating total", () => {
  const { r } = sample();
  const s = r.summary;
  assert.equal(s.payouts, 24000);
  assert.equal(s.buckets.payout.fees, 0);
  const others = ["charge", "refund", "dispute", "dispute_won", "adjustment", "reserve", "other"].reduce((a, b) => a + s.buckets[b].net, 0);
  assert.ok(Math.abs(s.operatingNet - others) < 0.01);
});

test("effective rate is charge fees over charge gross, and each group's fees add back to the total", () => {
  const { r } = sample();
  const s = r.summary;
  assert.ok(Math.abs(s.effectiveRate - s.chargeFees / s.gross) < 1e-9);
  for (const key of ["brand", "source", "method", "origin", "currency"]) {
    assert.ok(Math.abs(r.groups[key].reduce((a, g) => a + g.fees, 0) - s.chargeFees) < 0.01, key);
    assert.equal(r.groups[key].reduce((a, g) => a + g.count, 0), s.chargeCount);
  }
});

test("international cards cost more than domestic in the sample and the finding names it", () => {
  const { r } = sample();
  const i = r.summary.intl;
  assert.ok(i.intlRate > i.domRate);
  assert.ok(i.share > 0.2 && i.share < 0.5);
  assert.ok(r.findings.some((f) => /International cards/.test(f.title)));
  assert.ok(r.groups.source.some((g) => g.key === "apple pay"));
});

test("refund cost is the fee on the refunded share of the charge, matched by order", () => {
  const csv = [
    "Transaction Date,Type,Order,Amount,Fee,Net",
    "2026-05-01,charge,#1,100.00,3.20,96.80",
    "2026-05-02,refund,#1,-40.00,0.00,-40.00",
    "2026-05-03,refund,#404,-10.00,0.00,-10.00",
  ].join("\n");
  const s = analyze(normalizeTransactions(parseCsv(csv)).rows).summary;
  assert.equal(s.refundsMatched, 1);
  assert.ok(Math.abs(s.refundCostMatched - 1.28) < 1e-9);
  assert.equal(s.refundsUnmatched, 1);
  assert.ok(Math.abs(s.refundCostEstimated - 10 * 0.032) < 1e-9);
});

test("a refund that returns its fee costs nothing", () => {
  const csv = "Transaction Date,Type,Order,Amount,Fee,Net\n2026-05-01,charge,#1,100,3.2,96.8\n2026-05-02,refund,#1,-100,-3.2,-96.8";
  assert.ok(Math.abs(analyze(normalizeTransactions(parseCsv(csv)).rows).summary.refundCost) < 1e-9);
});

test("disputes: rate is disputes over charges, fees are listed, reversals net against them", () => {
  const csv = [
    "Transaction Date,Type,Order,Amount,Fee,Net",
    "2026-05-01,charge,#1,100,3.2,96.8",
    "2026-05-01,charge,#2,100,3.2,96.8",
    "2026-05-05,dispute,#1,-100,15,-115",
    "2026-05-20,dispute_reversal,#1,100,-15,115",
  ].join("\n");
  const s = analyze(normalizeTransactions(parseCsv(csv)).rows).summary;
  assert.equal(s.disputeCount, 1);
  assert.equal(s.disputesWon, 1);
  assert.equal(s.disputeRate, 0.5);
  assert.equal(s.disputeFees, 15);
  assert.equal(s.disputeNet, 0);
});

test("foreign-currency premium compares the same file's foreign and same-currency rates", () => {
  const csv = [
    "Transaction Date,Type,Amount,Fee,Net,Presentment Currency,Currency",
    "2026-05-01,charge,100,3.00,97,USD,USD",
    "2026-05-01,charge,100,4.50,95.5,EUR,USD",
  ].join("\n");
  const s = analyze(normalizeTransactions(parseCsv(csv)).rows).summary;
  assert.equal(s.foreignCount, 1);
  assert.ok(Math.abs(s.currencyPremium - 1.5) < 1e-9);
});

test("what-if plan rate: new fees, rate and saving are exact arithmetic and editable", () => {
  const { r } = sample();
  const s = r.summary;
  const w = whatIfPlan(s, 2.5, 30);
  assert.ok(Math.abs(w.fees - (s.gross * 0.025 + s.chargeCount * 0.3)) < 1e-9);
  assert.ok(Math.abs(w.saved - (s.chargeFees - w.fees)) < 1e-9);
  assert.ok(Math.abs(whatIfPlan(s, 0, 0).saved - s.chargeFees) < 1e-9);
  assert.equal(whatIfPlan({ chargeCount: 0 }, 2.9, 30), null);
});

test("what-if international share: moving volume saves the rate gap and needs both origins", () => {
  const { r } = sample();
  const i = r.summary.intl;
  const w = whatIfIntl(r.summary, (i.share * 100) / 2);
  assert.ok(Math.abs(w.moved - i.share * i.knownGross / 2) < 1e-6);
  assert.ok(Math.abs(w.saved - w.moved * (i.intlRate - i.domRate)) < 1e-6);
  assert.ok(Math.abs(whatIfIntl(r.summary, i.share * 100).saved) < 1e-6);
  const none = analyze(normalizeTransactions(parseCsv("Transaction Date,Type,Amount,Fee,Net\n2026-05-01,charge,100,3,97")).rows).summary;
  assert.equal(whatIfIntl(none, 5), null);
});

test("unknown types are visible in an other bucket and flagged, not dropped", () => {
  const csv = "Transaction Date,Type,Amount,Fee,Net\n2026-05-01,charge,100,3,97\n2026-05-02,mystery,-5,0,-5";
  const r = analyze(normalizeTransactions(parseCsv(csv)).rows);
  assert.equal(r.summary.buckets.other.count, 1);
  assert.ok(r.findings.some((f) => /unrecognised type/.test(f.title)));
});

test("no rows gives an invalid result rather than NaN", () => {
  assert.ok(analyze([]).invalid);
});

test("findings are ordered by severity and every one has a title and detail", () => {
  const { r } = sample();
  const order = { high: 0, medium: 1, info: 2 };
  for (let i = 1; i < r.findings.length; i++) assert.ok(order[r.findings[i - 1].severity] <= order[r.findings[i].severity]);
  assert.ok(r.findings.every((f) => f.title && f.detail));
  assert.ok(r.findings.some((f) => /Refunds of/.test(f.title)));
  assert.ok(r.findings.some((f) => /dispute/.test(f.title)));
});
