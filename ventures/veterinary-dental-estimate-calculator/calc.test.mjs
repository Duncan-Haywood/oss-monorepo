import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, gradeCase, clean, annualGap, DEFAULTS } from "./calc.mjs";

test("grade 1 defaults match the hand computation", () => {
  const { o } = clean({});
  const c = gradeCase(o, 1);
  // anesthesia 45 min = 0.75 h -> fee 71.25; revenue 260+71.25+110+75+150+0+0+40 = 706.25
  assert.equal(c.revenue, 706.25);
  // cost 38 + 30*0.75 + 95*0.25 + 60*0.75 = 38+22.5+23.75+45 = 129.25
  assert.equal(c.cost, 129.25);
  assert.equal(c.profit, 577);
});

test("grade 4 adds extractions, blocks, supplies and time", () => {
  const { o } = clean({});
  const c = gradeCase(o, 4);
  // 5 simple + 5 surgical: anesthesia 45+25+70 = 140 min
  assert.equal(c.anesMin, 140);
  assert.equal(c.teeth, 10);
  assert.equal(c.fee.extractions, 5 * 60 + 5 * 135);
  assert.equal(c.fee.blocks, 220);
  // dvm minutes 15 + 10*6 = 75
  assert.equal(c.dvmMin, 75);
});

test("higher grades cost more", () => {
  const e = estimate({});
  for (let i = 1; i < 4; i++) assert.ok(e.cases[i].cost > e.cases[i - 1].cost);
});

test("a low flat quote loses money on severe disease and says so", () => {
  const e = estimate({ flatQuote: 300 });
  assert.ok(e.cases[3].flatProfit < 0);
  assert.ok(e.findings.some((f) => f.severity === "high"));
});

test("price for target margin delivers exactly that margin", () => {
  const { o } = clean({ targetMarginPct: 35 });
  const c = gradeCase(o, 3);
  assert.ok(Math.abs((c.priceForTarget - c.cost) / c.priceForTarget - 0.35) < 0.001);
});

test("no flat quote means no flat findings", () => {
  const e = estimate({ flatQuote: 0 });
  assert.ok(e.cases.every((c) => c.flat === null));
  assert.ok(!e.findings.some((f) => /flat/i.test(f.title)));
});

test("rejects negative and impossible input", () => {
  assert.ok(estimate({ cleaningFee: -5 }).error);
  assert.ok(estimate({ targetMarginPct: 100 }).error);
  assert.ok(estimate({ baseMinutes: 0 }).error);
});

test("blank fields fall back to defaults", () => {
  assert.deepEqual(estimate({ cleaningFee: "" }).cases[0].fee.cleaning, DEFAULTS.cleaningFee);
});

test("annual gap blends target price by case mix", () => {
  const g = annualGap({}, [25, 25, 25, 25], 100);
  assert.ok(Math.abs(g.perYear - g.perCase * 100) < 1);
  assert.ok(annualGap({}, [0, 0, 0, 0], 10).error);
});
