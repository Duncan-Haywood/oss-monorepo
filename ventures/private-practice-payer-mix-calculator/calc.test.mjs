import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, isCashPayer, netPerSession, DEFAULTS } from "./calc.mjs";

const run = (text, opts) => {
  const p = parseRows(text);
  assert.ok(p.rows, p.error);
  return analyze(p.rows, opts);
};
const two = "payer,allowed,sessions,paid,days,admin\nPanel,100,40,90%,30,6\nCash,150,10,100%,0,0";

test("parses a header, quoted names, percent and fraction paid shares, and blanks", () => {
  const p = parseRows('payer,allowed,sessions\n"Smith, Jones & Co",$110.50,12,95\nCash,150,4,,,');
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { payer: "Smith, Jones & Co", allowed: 110.5, sessions: 12, collect: 0.95, days: 30, admin: 0 });
  assert.equal(p.rows[1].collect, 1);
  assert.equal(parseRows("A\t100\t5\t0.9\t20\t3\nB\t80\t5").rows[0].collect, 0.9);
});

test("refuses empty input, a single payer, zero sessions, and bad rows are counted", () => {
  assert.ok(parseRows("").error);
  assert.match(parseRows("A,100,5").error, /at least two/);
  assert.match(parseRows("A,100,0\nB,90,0").error, /zero sessions/);
  const p = parseRows("A,100,5\nB,90,5\nC,abc,5\nD,100,5,150%");
  assert.equal(p.rows.length, 2);
  assert.match(p.warnings.join(" "), /2 row\(s\) skipped/);
});

test("net per session matches a hand calculation", () => {
  // 100 allowed x 0.9 paid = 90; 6 admin minutes at $40/h = 4; net 86; hours 75/60 = 1.25 -> 68.80/h
  const r = run(two);
  const panel = r.rows.find((x) => x.payer === "Panel");
  assert.equal(panel.netPerSession, 86);
  assert.equal(panel.netPerHour, 68.8);
  assert.equal(panel.monthlyNet, 3440);
  assert.equal(panel.leak, 0.14);
  const cash = r.rows.find((x) => x.payer === "Cash");
  assert.equal(cash.netPerSession, 150);
  assert.equal(cash.netPerHour, 120);
});

test("a billing-service percentage hits panels but never cash", () => {
  const r = run(two, { billingFeePct: 5 });
  assert.equal(r.rows.find((x) => x.payer === "Panel").netPerSession, 100 * 0.9 * 0.95 - 4);
  assert.equal(r.rows.find((x) => x.payer === "Cash").netPerSession, 150);
});

test("break-even refill share and annual result at a refill rate", () => {
  const r = run(two);
  const s = r.scenarios[0];
  assert.equal(s.breakEvenRefill, round4(86 / 150));
  // drop 40 sessions/month, refill half at 150 net: 12 x 40 x (0.5 x 150 - 86) = -5280
  assert.equal(s.annual[0.5], -5280);
  assert.equal(s.annual[1], 12 * 40 * (150 - 86));
  assert.equal(s.verdict, "keep unless slots fill fast");
});

test("the contract rate that matches the cash net per hour is solved exactly", () => {
  const r = run(two);
  // target 120/h x 1.25 h = 150, plus admin 4, over 0.9 paid = 171.11
  assert.equal(r.scenarios[0].targetAllowed, 171.11);
  assert.equal(r.scenarios[0].rateGap, 71.11);
  const t = run(two, { targetHourly: 68.8 });
  assert.equal(t.scenarios[0].targetAllowed, 100);
});

test("a panel that nets nothing after denials and admin is flagged as losing money", () => {
  const r = run("Bad,50,10,50%,60,40\nCash,150,5");
  assert.ok(r.scenarios[0].verdict === "loses money");
  assert.ok(r.scenarios[0].annual[0.25] > 0);
});

test("without a cash row there is no refill comparison, only a warning", () => {
  const r = run("A,100,5,90%\nB,80,5,95%");
  assert.equal(r.scenarios[0].breakEvenRefill, null);
  assert.match(r.warnings.join(" "), /No cash or private-pay row/);
  const t = run("A,100,5,90%\nB,80,5,95%", { targetHourly: 70 });
  assert.ok(t.scenarios[0].targetAllowed > 0);
});

test("receivables follow days to payment and slow payers are named", () => {
  const r = run("Slow,100,30,100%,60\nCash,100,10");
  assert.equal(r.rows.find((x) => x.payer === "Slow").receivables, 6000);
  assert.match(r.warnings.join(" "), /Slow are slow to pay/);
});

test("totals, ordering, and cash-name detection", () => {
  const r = run(two);
  assert.equal(r.best, "Cash");
  assert.equal(r.worst, "Panel");
  assert.equal(r.totals.sessions, 50);
  assert.equal(r.totals.monthlyNet, 3440 + 1500);
  assert.ok(isCashPayer("Private pay") && isCashPayer("self-pay") && isCashPayer("Sliding scale") && !isCashPayer("Aetna"));
  assert.equal(netPerSession({ payer: "X", allowed: 100, collect: 1, admin: 0 }, DEFAULTS), 100);
});

test("bad settings are refused and the sample runs with a sensible order", () => {
  const p = parseRows(two);
  assert.ok(analyze(p.rows, { sessionMinutes: 0 }).error);
  assert.ok(analyze(p.rows, { billingFeePct: 100 }).error);
  const s = run(sampleText());
  assert.equal(s.rows.length, 6);
  assert.equal(s.rows[0].payer, "Cash / private pay");
  assert.equal(s.rows[s.rows.length - 1].payer, "Medicaid plan");
});

test("csv export lists every payer", () => {
  const r = run(two);
  const lines = reportCsv(r).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^payer,allowed/);
});

function round4(n) { return Math.round(n * 10000) / 10000; }
