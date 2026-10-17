import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, classify, contractLabel, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const load = (csv) => normalizeRows(parseCsv(csv));

test("classify separates fees, withdrawals, refunds and income", () => {
  assert.equal(classify("Withdrawal Fee", ""), "fee-withdrawal");
  assert.equal(classify("Withdrawal", "Withdrawal to bank"), "withdrawal");
  assert.equal(classify("Service Fee", "Service Fee - Ref ID 1"), "fee-service");
  assert.equal(classify("Connects", ""), "fee-connects");
  assert.equal(classify("Membership", ""), "fee-membership");
  assert.equal(classify("Refund", "Refund - dispute"), "refund");
  assert.equal(classify("Hourly", ""), "income");
  assert.equal(classify("Fixed Price", "Milestone"), "income");
  assert.equal(classify("", "Mystery"), "other");
});

test("contractLabel prefers the team column and strips noise from descriptions", () => {
  assert.equal(contractLabel("Hourly: 20 hrs @ $45", "Acme"), "Acme");
  assert.equal(contractLabel("Hourly - Data cleanup for Acme - 12.5 hrs", ""), "Data cleanup for Acme");
  assert.equal(contractLabel("Hourly", ""), "(no contract name)");
});

test("the example reads without skips and reconciles", () => {
  const n = load(sampleCsv());
  assert.equal(n.skipped.length, 0);
  assert.equal(n.currency, "USD");
  const s = analyze(n.rows).summary;
  near(s.gross, 3342.5);
  near(s.fees.service, 334.25);
  near(s.fees.connects, 24);
  near(s.fees.membership, 14.99);
  near(s.fees.withdrawal, 4);
  near(s.refunds, 100);
  near(s.net, s.gross - s.refunds - s.feeTotal);
  near(s.serviceFeeRate, 0.1, 1e-9);
  assert.equal(s.withdrawals, 2);
  near(s.withdrawn, 2700);
});

test("contracts and months add up to the totals", () => {
  const r = analyze(load(sampleCsv()).rows);
  near(r.byContract.reduce((a, c) => a + c.gross, 0), r.summary.gross);
  near(r.byContract.reduce((a, c) => a + c.serviceFee, 0) + r.summary.unattributedServiceFee, r.summary.fees.service);
  near(r.byMonth.reduce((a, m) => a + m.net, 0), r.summary.net);
  assert.deepEqual(r.byMonth.map((m) => m.month), ["2026-06", "2026-07"]);
});

test("net per hour deducts the payment's own service fee and ignores unrecorded hours", () => {
  const r = analyze(load(sampleCsv()).rows);
  const acme = r.byContract.find((c) => c.label === "Acme Analytics");
  near(acme.hours, 38.5);
  near(acme.netPerHour, (1732.5 - 173.25) / 38.5);
  const brightside = r.byContract.find((c) => c.label === "Brightside Studio");
  assert.equal(brightside.netPerHour, null);
});

test("target hourly names contracts under it; refunds and concentration are flagged", () => {
  const r = analyze(load(sampleCsv()).rows, { targetHourly: 30 });
  const titles = r.findings.map((f) => f.title);
  assert.ok(titles.some((t) => t.includes("Northwind Support") && t.includes("under your")));
  assert.ok(!titles.some((t) => t.includes("Acme Analytics") && t.includes("under your")));
  assert.ok(titles.some((t) => /refunded/.test(t)));
  assert.ok(titles.some((t) => /One contract is/.test(t)));
});

test("fees stored as positive numbers give the same result", () => {
  const pos = sampleCsv().split("\n").map((l, i) => (i && /(Fee|Connects|Membership)/.test(l) ? l.replace(",-", ",") : l)).join("\n");
  near(analyze(load(pos).rows).summary.net, analyze(load(sampleCsv()).rows).summary.net);
});

test("service fees with no ref match fall back to same-day contract, else stay unattributed", () => {
  const csv = "Date,Type,Description,Team,Amount\n2026-05-01,Hourly,Hourly: 10 hrs,A,100\n2026-05-01,Service Fee,Service Fee,A,-10\n2026-05-02,Service Fee,Service Fee,Z,-5\n";
  const s = analyze(load(csv).rows);
  near(s.byContract[0].serviceFee, 10);
  near(s.summary.unattributedServiceFee, 5);
});

test("date range filter and empty range", () => {
  const rows = load(sampleCsv()).rows;
  near(analyze(rows, { from: Date.UTC(2026, 6, 1) }).summary.gross, 1210);
  assert.ok(analyze(rows, { from: Date.UTC(2030, 0, 1) }).invalid);
});

test("bad files fail loudly, bad rows are listed", () => {
  assert.ok(load("foo,bar\n1,2").error);
  const n = load("Date,Type,Amount\nnot a date,Hourly,5\n2026-01-02,Hourly,abc\n2026-01-03,Hourly,7\n");
  assert.equal(n.skipped.length, 2);
  assert.equal(n.rows.length, 1);
});

test("no hours anywhere gives a finding rather than a zero rate", () => {
  const r = analyze(load("Date,Type,Amount\n2026-01-03,Fixed Price,100\n2026-01-03,Service Fee,-10\n").rows);
  assert.equal(r.summary.netPerHour, null);
  assert.ok(r.findings.some((f) => /No hours/.test(f.title)));
});
