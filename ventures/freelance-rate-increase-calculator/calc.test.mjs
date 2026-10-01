import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClients, analyze, breakEvenLoss, sampleJob, reportCsv, money, money2 } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const one = (txt) => parseClients(txt).rows;

test("parser reads lines, treats a blank leave chance as 0, skips a header and bad rows, and warns", () => {
  const p = parseClients("client,hours,rate,leave\nA,40,80,10\nbad,x,80,1\nB,0,80,1\nC,10,50,\nD,10,50,150");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].leavePct, 0);
  assert.match(p.warnings[0], /3 client line/);
  assert.match(parseClients("").error, /Add at least one/);
});

test("hand-calculated break-even: a 20% raise pays until 16.67% of hours leave", () => {
  near(breakEvenLoss(20), 20 / 120);
  near(breakEvenLoss(10), 10 / 110);
  assert.equal(breakEvenLoss(0), 0);
});

test("refilling lost hours moves the break-even point up, capped at 100%", () => {
  near(breakEvenLoss(20, 50), (0.2 / 1.2) / 0.5);
  assert.equal(breakEvenLoss(200, 90), 1);
});

test("one client, hand-calculated: 50 h at $80, 15% raise, 10% leave, no refill", () => {
  const r = analyze({ raisePct: 15, refillPct: 0 }, one("A,50,80,10"));
  const l = r.lines[0];
  near(l.newRate, 92);
  near(l.before, 4000);
  near(l.hoursAfter, 45);
  near(l.after, 45 * 92);
  near(l.delta, 4140 - 4000);
  near(r.totals.annualDelta, 140 * 12);
  near(r.totals.hoursFreed, 5);
  assert.equal(l.safe, true);
});

test("raise that loses money is reported as a loss and the client is flagged", () => {
  const r = analyze({ raisePct: 10, refillPct: 0 }, one("A,50,80,20"));
  assert.ok(r.totals.delta < 0);
  assert.equal(r.lines[0].safe, false);
  assert.match(r.verdict, /loses about/);
  assert.match(r.warnings[0], /A is above the 9\.1% leave chance/);
});

test("refill recovers hours at the new rate", () => {
  const r = analyze({ raisePct: 10, refillPct: 50 }, one("A,100,100,20"));
  near(r.lines[0].hoursAfter, 100 * (1 - 0.2 * 0.5));
  near(r.lines[0].after, 90 * 110);
});

test("totals add across clients and effective hourly rises with the raise", () => {
  const r = analyze({ raisePct: 20, refillPct: 0 }, one("A,40,50,0\nB,60,100,10"));
  near(r.totals.before, 2000 + 6000);
  near(r.totals.hoursBefore, 100);
  near(r.totals.hoursAfter, 94);
  assert.ok(r.totals.hourlyAfter > r.totals.hourlyBefore);
  near(r.totals.expectedLossPct, 6);
});

test("ladder uses the typed leave chances at other raises", () => {
  const r = analyze({ raisePct: 10, refillPct: 0 }, one("A,100,100,10"));
  const p20 = r.ladder.find((x) => x.raisePct === 20);
  near(p20.monthly, 90 * 120);
  near(p20.delta, 90 * 120 - 10000);
});

test("validation errors", () => {
  assert.match(analyze({ raisePct: 0 }, one("A,1,1,0")).error, /raise/);
  assert.match(analyze({ raisePct: 10, refillPct: 100 }, one("A,1,1,0")).error, /99 or less|between/);
  assert.match(analyze({ raisePct: "abc" }, one("A,1,1,0")).error, /raisePct/);
});

test("sample runs and the CSV has a row per client plus header", () => {
  const s = sampleJob();
  const r = analyze(s.settings, parseClients(s.clients).rows);
  assert.ok(!r.error);
  const rows = reportCsv(r).trim().split("\n");
  assert.equal(rows.length, r.lines.length + 1);
});

test("money formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
