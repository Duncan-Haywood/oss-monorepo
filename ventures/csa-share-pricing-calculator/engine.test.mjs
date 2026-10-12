import test from "node:test";
import assert from "node:assert/strict";
import { parseLines, plan, perShare, season, priceForWage, breakEvenShares, sweep, summarize, money } from "./engine.mjs";

const O = { seasonWeeks: 10, shares: 40, price: 150, feePct: 3, packaging: 1, delivery: 0, packMinutes: 5, hourlyRate: 20, fixedCosts: 1000, capacity: 120, elasticity: 0, targetWage: 20 };
const BOX = "Salad,2,5,0.8,5,10\nTomatoes,3,4,0.6,4,6";

test("parse accepts header, comments, notes; reports each bad row", () => {
  const ok = parseLines("item,qty_per_box,value_each,cost_each,minutes_each,weeks\n# c\nA,2,10,3,5,8,a note, with comma\n");
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.items[0].note, "a note,with comma");
  const bad = parseLines("A,2,10\nB,0,10,3,5,8\nC,1,-1,3,5,8\nD,1,1,-3,5,8\nE,1,1,3,x,8\nF,1,1,3,5,0\nG,1,1,3,5,2.5\n,1,1,3,5,8");
  assert.equal(bad.errors.length, 8);
});

test("per-share figures match the written formula", () => {
  const ps = perShare(parseLines(BOX).items, { seasonWeeks: 10, packaging: 1, delivery: 0, packMinutes: 5 });
  assert.ok(Math.abs(ps.retail - (10 * 2 * 5 + 6 * 3 * 4)) < 1e-9);
  assert.ok(Math.abs(ps.itemCost - (10 * 2 * 0.8 + 6 * 3 * 0.6)) < 1e-9);
  assert.ok(Math.abs(ps.hours - ((10 * 2 * 5 + 6 * 3 * 4) / 60 + (10 * 5) / 60)) < 1e-9);
  assert.equal(ps.boxCosts, 10);
});

test("season profit before and after your pay", () => {
  const p = plan(parseLines(BOX), O);
  assert.ok(Math.abs(p.now.beforePay - 3348) < 1e-6);
  assert.ok(Math.abs(p.now.afterPay - 388) < 1e-6);
  assert.ok(Math.abs(p.now.hours - 148) < 1e-9);
  assert.ok(Math.abs(p.valueRatio - 172 / 150) < 1e-12);
});

test("the wage price pays exactly the target wage, and break-even shares zero out profit", () => {
  const ps = perShare(parseLines(BOX).items, O);
  for (const wage of [0, 12, 20, 35]) {
    const price = priceForWage(ps, O, 40, wage);
    const s = season(ps, O, price, 40);
    assert.ok(Math.abs(s.wage - wage) < 1e-9, `wage ${wage}`);
  }
  const n = breakEvenShares(ps, O, 150);
  const s = season(ps, O, 150, n);
  assert.ok(Math.abs(s.afterPay) < 1e-7);
  assert.equal(breakEvenShares(ps, { ...O, hourlyRate: 500 }, 150), null);
});

test("sweep follows the stated demand curve, honours capacity and picks the best row", () => {
  const ps = perShare(parseLines(BOX).items, O);
  const sw = sweep(ps, { ...O, elasticity: 1, capacity: 50 });
  const at = (pct) => sw.rows.find((r) => r.pct === pct);
  assert.equal(at(100).members, 40);
  assert.equal(at(125).members, 32);
  assert.equal(at(60).members, 50);
  for (const r of sw.rows) assert.ok(r.afterPay <= sw.best.afterPay + 1e-9);
  assert.ok(sweep(ps, O).rows.every((r) => r.members === 40));
});

test("findings fire on weak value, unpaid labour and over-capacity", () => {
  const p = plan(parseLines(BOX), { ...O, price: 400, hourlyRate: 150, shares: 130, capacity: 100 });
  const rules = p.findings.map((f) => f.rule);
  for (const r of ["value-below-price", "unpaid-labour", "over-capacity"]) assert.ok(rules.includes(r), r);
  assert.equal(summarize(p).status, "loss");
});

test("bad options and an item longer than the season are rejected", () => {
  assert.throws(() => plan(parseLines(BOX), { ...O, feePct: 100 }), /feePct/);
  assert.throws(() => plan(parseLines(BOX), { ...O, seasonWeeks: 5 }), /runs 10 weeks/);
  assert.throws(() => plan({ items: [] }, O), /No items/);
  assert.equal(money(-3.456), "-$3.46");
});
