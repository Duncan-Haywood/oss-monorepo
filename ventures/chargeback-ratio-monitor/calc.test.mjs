import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, analyze, statusFor, headroom, txnsToDilute, sampleCsv, parseAmount, DEFAULT_OPTIONS, networkOf, prevMonth } from "./calc.mjs";

const HEAD = "id,Created (UTC),Amount,Currency,Status,Customer ID,Card Brand,Disputed Amount,Dispute Date (UTC),Dispute Reason";
const csv = (...rows) => [HEAD, ...rows].join("\n");
const norm = (text) => normalizeRows(parseCsv(text));

test("parseAmount reads money formats and rejects text", () => {
  assert.equal(parseAmount("$1,234.50"), 1234.5);
  assert.equal(parseAmount("(5.00)"), -5);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("a missing dispute column is an error, not a silent zero ratio", () => {
  const n = norm("id,Created (UTC),Amount,Status\n1,2026-01-01,10,Paid");
  assert.match(n.error, /No dispute column/);
});

test("only settled charges count; failed ones are ignored and unknown statuses are skipped with a line number", () => {
  const n = norm(csv(
    "1,2026-01-05 10:00:00,10.00,USD,Paid,c1,visa,,,",
    "2,2026-01-06 10:00:00,10.00,USD,Failed,c2,visa,,,",
    "3,2026-01-07 10:00:00,10.00,USD,Wibble,c3,visa,,,",
    "4,not a date,10.00,USD,Paid,c4,visa,,,",
  ));
  assert.equal(n.events.length, 1);
  assert.equal(n.ignored, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [4, 5]);
});

test("disputes are counted in the month the dispute was opened, not the month of the charge", () => {
  const n = norm(csv(
    "1,2026-01-30 10:00:00,50.00,USD,Paid,c1,visa,50.00,2026-02-10 10:00:00,fraudulent",
    "2,2026-02-02 10:00:00,50.00,USD,Paid,c2,visa,,,",
  ));
  const r = analyze(n.events);
  const jan = r.byMonth.find((x) => x.key === "2026-01"), feb = r.byMonth.find((x) => x.key === "2026-02");
  assert.equal(jan.disputes, 0);
  assert.equal(feb.disputes, 1);
  assert.equal(feb.txns, 1);
});

test("thresholds map to statuses at the line, inclusive", () => {
  const o = DEFAULT_OPTIONS;
  assert.equal(statusFor(0.001, o), "ok");
  assert.equal(statusFor(0.0075, o), "watch");
  assert.equal(statusFor(0.009, o), "elevated");
  assert.equal(statusFor(0.015, o), "excessive");
  assert.equal(statusFor(null, o), "none");
});

test("headroom is how many more disputes stay under the line, negative when over", () => {
  assert.equal(headroom(1000, 5, 0.01), 4); // 10 would hit the line, so 9 total is the most: 4 more
  assert.equal(headroom(1000, 10, 0.01), -1);
  assert.equal(headroom(1000, 0, 0.01), 9);
});

test("txnsToDilute gives the smallest count that gets strictly under the line", () => {
  assert.equal(txnsToDilute(10, 0.01), 1001);
  assert.ok(10 / txnsToDilute(10, 0.01) < 0.01);
  assert.ok(10 / (txnsToDilute(10, 0.01) - 1) >= 0.01);
});

test("every table reconciles to the same dispute total", () => {
  const r = analyze(norm(sampleCsv()).events);
  const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
  assert.equal(sum(r.byMonth, "disputes"), r.summary.disputes);
  assert.equal(sum(r.byReason, "disputes"), r.summary.disputes);
  assert.equal(sum(r.byBrand, "disputes"), r.summary.disputes);
  assert.equal(sum(r.byMonth, "txns"), r.summary.txns);
  assert.equal(sum(r.byBrand, "txns"), r.summary.txns);
});

test("the worked example is a rising ratio that the report notices", () => {
  const n = norm(sampleCsv());
  assert.equal(n.error, undefined);
  const r = analyze(n.events);
  assert.ok(r.projection && r.projection.slope > 0);
  assert.ok(r.findings.some((f) => /rising/.test(f.title)));
  assert.ok(r.byReason[0].key === "fraudulent");
  assert.ok(r.repeat.length >= 1);
});

test("the latest month judged has sales even when disputes land after it", () => {
  const n = norm(csv(
    "1,2026-01-30 10:00:00,50.00,USD,Paid,c1,visa,50.00,2026-02-10 10:00:00,fraudulent",
  ));
  const r = analyze(n.events);
  assert.equal(r.byMonth.length, 2);
  assert.equal(r.room[0].headroom, headroom(1, 0, DEFAULT_OPTIONS.warn));
});

test("cost is fees plus exposure not won back", () => {
  const n = norm(csv(
    "1,2026-01-05 10:00:00,100.00,USD,Paid,c1,visa,100.00,2026-01-10 10:00:00,fraudulent",
    "2,2026-01-06 10:00:00,100.00,USD,Paid,c2,visa,,,",
  ));
  const r = analyze(n.events, { fee: 15, winRate: 0.5 });
  assert.equal(r.cost.fees, 15);
  assert.equal(r.cost.exposure, 50);
  assert.equal(r.cost.total, 65);
});

test("bad thresholds are rejected rather than producing a report", () => {
  const n = norm(sampleCsv());
  assert.match(analyze(n.events, { warn: 0.02, elevated: 0.01, excessive: 0.015 }).invalid, /Thresholds/);
});

test("rows in a second currency are left out and counted", () => {
  const n = norm(csv(
    "1,2026-01-05 10:00:00,10.00,USD,Paid,c1,visa,,,",
    "2,2026-01-05 10:00:00,10.00,USD,Paid,c2,visa,,,",
    "3,2026-01-05 10:00:00,10.00,EUR,Paid,c3,visa,,,",
  ));
  assert.equal(n.currency, "USD");
  assert.equal(n.otherCurrency, 1);
  assert.equal(n.events.length, 2);
});

test("the under-the-line finding names the dispute count that reaches the watch line (quality audit 2026-11-19)", () => {
  const rows = [];
  for (let i = 0; i < 1000; i++) rows.push(`${i},2026-01-05 10:00:00,10.00,USD,Paid,c${i},visa,,,`);
  const r = analyze(norm(csv(...rows)).events);
  const f = r.findings.find((x) => x.severity === "info" && /watch line/.test(x.detail));
  assert.ok(f, "info finding present");
  // 0.75% of 1000 is 7.5: 7 disputes is 0.70% (still under), 8 is 0.80%.
  assert.match(f.detail, /\b8 more disputes would reach/);
  assert.equal(statusFor(7 / 1000, DEFAULT_OPTIONS), "ok");
  assert.equal(statusFor(8 / 1000, DEFAULT_OPTIONS), "watch");
});

// Quality audit 2026-11-19, defects 0, 1, 2 and 4.
const rowsFor = (month, brand, n, disputes, startId, efw = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = startId + i;
    const dis = i < disputes ? `10.00,${month}-20 10:00:00,fraudulent` : ",,";
    out.push(`${id},${month}-05 10:00:00,10.00,USD,Paid,c${id},${brand},${dis}`);
  }
  return out;
};

test("networkOf maps common brand spellings", () => {
  assert.equal(networkOf("Visa"), "visa");
  assert.equal(networkOf("MasterCard"), "mastercard");
  assert.equal(networkOf("MC"), "mastercard");
  assert.equal(networkOf("American Express"), "amex");
  assert.equal(networkOf(""), "");
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(prevMonth("2026-11"), "2026-10");
});

test("a brand over the line is reported when the blended ratio is not (worked example: Mastercard 9/373 in June)", () => {
  const r = analyze(norm(sampleCsv()).events);
  const mc = r.brandLatest.find((b) => b.network === "mastercard");
  assert.equal(mc.key, "2026-06");
  assert.equal(mc.disputes, 9);
  assert.equal(mc.txns, 373);
  assert.equal(mc.status, "excessive");
  assert.equal(r.byMonth.find((m) => m.key === "2026-06").status, "elevated");
  assert.ok(r.findings.some((f) => f.severity === "high" && /mastercard alone is at 2\.41%/.test(f.title)));
});

test("Mastercard ECP divides this month's chargebacks by LAST month's Mastercard charges", () => {
  // Jan 10,000 charges, Feb 5,000 charges with 120 chargebacks: ECP 1.20%, not 2.40%.
  const rows = [...rowsFor("2026-01", "mastercard", 10000, 0, 1), ...rowsFor("2026-02", "mastercard", 5000, 120, 20000)];
  const r = analyze(norm(csv(...rows)).events);
  const ecm = r.programmes.find((p) => p.id === "ecm");
  assert.equal(ecm.numerator, 120);
  assert.equal(ecm.denominator, 10000);
  assert.equal(ecm.ratio, 0.012);
  assert.equal(ecm.level, null);
  assert.equal(ecm.overRatio, false);
});

test("ECM needs both the ratio and 100 chargebacks; HECM 3% and 300", () => {
  const ecmRows = [...rowsFor("2026-01", "mastercard", 6000, 0, 1), ...rowsFor("2026-02", "mastercard", 6000, 100, 10000)];
  assert.equal(analyze(norm(csv(...ecmRows)).events).programmes.find((p) => p.id === "ecm").level, "ECM");
  const below = [...rowsFor("2026-01", "mastercard", 1000, 0, 1), ...rowsFor("2026-02", "mastercard", 1000, 99, 10000)];
  const p = analyze(norm(csv(...below)).events).programmes.find((x) => x.id === "ecm");
  assert.equal(p.overRatio, true);
  assert.equal(p.level, null);
  assert.match(p.reading, /below the 100 chargeback minimum/);
  const hecm = [...rowsFor("2026-01", "mastercard", 10000, 0, 1), ...rowsFor("2026-02", "mastercard", 10000, 300, 20000)];
  assert.equal(analyze(norm(csv(...hecm)).events).programmes.find((x) => x.id === "ecm").level, "HECM");
});

test("Visa VAMP adds early fraud warnings to disputes; the line is 1.5% from April 2026, 2.2% before", () => {
  const H = "id,Created (UTC),Amount,Currency,Status,Card Brand,Disputed Amount,Dispute Date (UTC),Early Fraud Warning";
  const rows = [H];
  for (let i = 0; i < 1000; i++) {
    const dis = i < 5 ? "10.00,2026-05-20 10:00:00" : ",";
    const efw = i >= 5 && i < 11 ? "yes" : "";
    rows.push(`${i},2026-05-05 10:00:00,10.00,USD,Paid,visa,${dis},${efw}`);
  }
  const ev = norm(rows.join("\n")).events;
  const r = analyze(ev);
  const vamp = r.programmes.find((p) => p.id === "vamp");
  assert.equal(vamp.numerator, 11);
  assert.equal(vamp.ratio, 0.011);
  assert.equal(vamp.line, 0.015);
  assert.equal(r.byMonth[0].ratio, 0.005);
  // Opting in puts the warnings in the monthly ratio too.
  assert.equal(analyze(ev, { includeFraud: true }).byMonth[0].ratio, 0.011);
  const march = norm(rows.join("\n").replaceAll("2026-05-", "2026-03-")).events;
  assert.equal(analyze(march).programmes.find((p) => p.id === "vamp").line, 0.022);
});

test("an elevated or excessive month names the programmes' minimum counts", () => {
  const rows = rowsFor("2026-01", "visa", 1000, 16, 1);
  const f = analyze(norm(csv(...rows)).events).findings[0];
  assert.equal(f.severity, "high");
  assert.match(f.detail, /1,500 fraud reports plus disputes/);
  assert.match(f.detail, /under both minimums/);
});

test("refunded charges stay in the denominator", () => {
  const n = norm(csv(
    "1,2026-01-05 10:00:00,10.00,USD,Refunded,c1,visa,,,",
    "2,2026-01-05 10:00:00,10.00,USD,Paid,c2,visa,10.00,2026-01-09 10:00:00,general",
  ));
  assert.equal(analyze(n.events).byMonth[0].txns, 2);
});
