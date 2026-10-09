import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, analyze, statusFor, headroom, txnsToDilute, sampleCsv, parseAmount, DEFAULT_OPTIONS } from "./calc.mjs";

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
