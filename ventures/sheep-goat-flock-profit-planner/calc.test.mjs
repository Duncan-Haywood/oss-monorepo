import { test } from "node:test";
import assert from "node:assert/strict";
import {
  yearModel, project, weanedSensitivity, hayPriceSensitivity, pricePerLbSensitivity, scenarios,
  holdSteadyWeaned, breakEvenWeaned, breakEvenFemales, DEFAULTS, PRESETS, num, money,
} from "./calc.mjs";

const o = { ...DEFAULTS };

test("deaths, culls, weaning and room cap", () => {
  const r = yearModel(20, { ...o, deathPct: 10, cullPct: 10, weanedPerFemale: 2, femaleSharePct: 50, cap: 20 });
  assert.equal(r.survivors, 18);
  assert.equal(r.weaned, 36);
  assert.equal(r.culls, 1.8);
  assert.ok(Math.abs(r.retained - 3.8) < 1e-9); // room = 20 - 16.2
  assert.ok(Math.abs(r.end - 20) < 1e-9);
});

test("female young beyond the pasture limit are sold, as breeding stock only up to the chosen share", () => {
  const base = { ...o, deathPct: 0, cullPct: 0, weanedPerFemale: 2, femaleSharePct: 50, cap: 10, finishSharePct: 0 };
  const none = yearModel(10, { ...base, breedingSharePct: 0 });
  const half = yearModel(10, { ...base, breedingSharePct: 50, breedingPrice: 300 });
  assert.equal(none.retained, 0);
  assert.equal(none.breedingSold, 0);
  assert.equal(half.breedingSold, 5);
  assert.equal(half.breedingRev, 1500);
});

test("young revenue splits between weaning sales and finished sales", () => {
  const r = yearModel(10, {
    ...o, deathPct: 0, cullPct: 0, weanedPerFemale: 2, femaleSharePct: 0, cap: 10, finishSharePct: 50,
    weanWeight: 80, weanPrice: 2, finishWeight: 120, finishPrice: 1.5, cullPrice: 0, woolPerHead: 0,
  });
  assert.equal(r.marketYoung, 20);
  assert.equal(r.finished, 10);
  assert.equal(r.youngRev, 10 * 80 * 2 + 10 * 120 * 1.5);
});

test("feed, rams and marketing are charged where they say", () => {
  const r = yearModel(30, {
    ...o, hayLbPerDay: 4, hayDays: 100, hayPrice: 200, grainPerFemale: 10, vetPerFemale: 5, creepPerYoung: 0,
    ramCost: 600, femalesPerRam: 30, ramLifeYears: 3, marketingPerHead: 0, fixedYear: 0, finishSharePct: 0,
  });
  assert.equal(r.hay, 30 * (400 / 2000) * 200);
  assert.equal(r.rams, 200);
  assert.equal(r.vet, 150);
});

test("the plan pays back or it does not, and flock value is reported apart from cash", () => {
  const p = project({ ...o, years: 5 });
  assert.equal(p.rows.length, 5);
  assert.equal(p.invest, 25 * 250 + 4000);
  assert.ok(Math.abs(p.netGain - (p.rows.at(-1).cumulative + p.finalFemales * 250)) < 1e-6);
  const rich = project({ ...o, weanPrice: 6 });
  assert.ok(rich.paybackYear !== null && rich.paybackYear <= 5);
});

test("more weaned young per female never lowers total profit", () => {
  const rows = weanedSensitivity(o);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].totalProfit >= rows[i - 1].totalProfit - 1e-6);
});

test("dearer hay never raises total profit", () => {
  const rows = hayPriceSensitivity(o);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].totalProfit <= rows[i - 1].totalProfit + 1e-6);
});

test("a lower price per pound never raises total profit", () => {
  const rows = pricePerLbSensitivity(o);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].totalProfit >= rows[i - 1].totalProfit - 1e-6);
});

test("scenarios list four ways to sell and the first is the no-extras baseline", () => {
  const s = scenarios(o);
  assert.equal(s.length, 4);
  const base = project({ ...o, finishSharePct: 0, breedingSharePct: 0 });
  assert.equal(s[0].totalProfit, base.totalProfit);
});

test("hold-steady weaning rate refills deaths and culls exactly", () => {
  const w = holdSteadyWeaned({ ...o, deathPct: 5, cullPct: 15, femaleSharePct: 50 });
  assert.equal(w, 0.41);
  const r = yearModel(100, { ...o, deathPct: 5, cullPct: 15, femaleSharePct: 50, weanedPerFemale: 0.4105263, cap: 100 });
  assert.ok(Math.abs(r.end - 100) < 0.01);
});

test("break-even weaned rate sits where profit is zero", () => {
  const w = breakEvenWeaned(o);
  assert.ok(w > 0 && w < 5);
  const f = o.startFemales;
  const at = yearModel(f, { ...o, cap: f, weanedPerFemale: w }).profit;
  assert.ok(Math.abs(at) < 40, `profit at break-even ${at}`);
  assert.equal(breakEvenWeaned({ ...o, weanPrice: 0.01, cullPrice: 0, woolPerHead: 0, breedingPrice: 0 }), null);
});

test("break-even flock size is null when every female loses money", () => {
  assert.equal(breakEvenFemales({ ...o, weanPrice: 0.1, cullPrice: 0, woolPerHead: 0 }), null);
  assert.ok(breakEvenFemales(o) > 0);
});

test("presets override only known keys", () => {
  for (const [k, p] of Object.entries(PRESETS)) {
    assert.ok(p.label, k);
    for (const key of Object.keys(p.values)) assert.ok(key in DEFAULTS, `${k}.${key}`);
  }
});

test("num and money parse and format", () => {
  assert.equal(num("$1,250.5"), 1250.5);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});
