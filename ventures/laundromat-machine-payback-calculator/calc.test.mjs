import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMachines, analyze, reportCsv, sampleMachines, money, money2 } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const rows = (t) => { const p = parseMachines(t); assert.ok(p.rows, p.error); return p.rows; };

test("parses lines with header, tabs, defaults and skips", () => {
  const p = parseMachines("line,count,price,turns,util,install\nWasher,8,$4.25,4.5,0.95,4800\nDryer\t10\t0.25\t6\t\t\nbad\nNeg,2,-1,3");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Washer", count: 8, price: 4.25, turns: 4.5, util: 0.95, install: 4800 });
  assert.deepEqual(p.rows[1], { name: "Dryer", count: 10, price: 0.25, turns: 6, util: 0, install: 0 });
  assert.match(p.warnings.join(" "), /2 machine line/);
  assert.ok(parseMachines("").error);
});

test("per-line hand calculation", () => {
  // 10 washers, $5/cycle, 4 turns/day, 30 days, 3% fee, $1 utilities, $5000 each
  const r = analyze(rows("W,10,5,4,1,5000"), { daysPerMonth: 30, cardFeePct: 3, targetPaybackMonths: 60 });
  const l = r.lines[0];
  near(l.cycles, 1200);
  near(l.revenue, 6000);
  near(l.feeCost, 180);
  near(l.utilCost, 1200);
  near(l.contribution, 4620);
  near(l.invested, 50000);
  near(l.paybackMonths, 50000 / 4620);
  near(l.perCycle, 5 * 0.97 - 1);
  // turns per day that land exactly on the target payback
  const at = analyze(rows(`W,10,5,${l.neededTurns},1,5000`), { daysPerMonth: 30, cardFeePct: 3, targetPaybackMonths: 60 });
  near(at.lines[0].paybackMonths, 60, 1e-7);
});

test("store net, break-even volume and annual", () => {
  const r = analyze(rows("W,10,5,4,1,5000"), { overheadMonthly: 3000, cardFeePct: 3 });
  near(r.store.net, 4620 - 3000);
  near(r.store.annual, (4620 - 3000) * 12);
  near(r.store.breakEvenVolume, 3000 / 4620);
});

test("a line that never earns contribution never pays back and warns", () => {
  const r = analyze(rows("Bad,2,1,3,1.2,3000"), {});
  assert.equal(r.lines[0].paybackMonths, null);
  assert.equal(r.lines[0].neededTurns, null);
  assert.equal(r.lines[0].meetsPayback, false);
  assert.match(r.verdict, /never pays back/);
  assert.ok(r.warnings.length >= 1);
});

test("price raise break-even: losing exactly that share of cycles leaves contribution unchanged", () => {
  const r = analyze(rows("W,10,5,4,1,5000"), { cardFeePct: 3 });
  const x = r.raises.find((q) => q.pct === 10);
  const c1 = 6000 * 1.1 * 0.97 - 1200;
  near(x.breakEvenLoss, (c1 - 4620) / c1);
  near(c1 * (1 - x.breakEvenLoss), 4620);
});

test("validation errors", () => {
  assert.ok(analyze(rows("W,1,5,4"), { cardFeePct: 100 }).error);
  assert.ok(analyze(rows("W,1,5,4"), { daysPerMonth: 0 }).error);
  assert.ok(analyze(rows("W,1,5,4"), { overheadMonthly: -5 }).error);
});

test("sample parses, report CSV quotes, money formats", () => {
  const r = analyze(rows(sampleMachines()), { overheadMonthly: 9000 });
  assert.equal(r.lines.length, 4);
  assert.ok(r.store.contribution > 0);
  const csv = reportCsv(r);
  assert.match(csv, /^Line,Machines/);
  assert.match(csv, /Store per month/);
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(money2(1234.5), "$1,234.50");
});
