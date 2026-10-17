import test from "node:test";
import assert from "node:assert/strict";
import { computeEggs, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: 20 hens at 70% lay is 5110 eggs and 391.77 dozen sold", () => {
  const r = computeEggs();
  close(r.eggsYear, 5110);
  close(r.dozensSold, 391.7666666666667, 1e-6);
  close(r.costYear, 1398.3683333333333, 1e-6);
  close(r.hoursYear, 208);
  assert.equal(money(r.costPerDozen), "$3.57");
  assert.equal(money(r.profitPerHour), "$2.69");
  assert.equal(money(r.wagePrice), "$11.53");
  assert.equal(r.biggest.key, "feed");
});

test("the wage price leaves exactly the wage; the cash price leaves zero margin", () => {
  const r = computeEggs();
  close(computeEggs({ price: r.wagePrice }).afterWageYear, 0, 1e-6);
  close(computeEggs({ price: r.breakevenPrice }).marginYear, 0, 1e-6);
});

test("lower lay rate and dearer feed both raise the price needed", () => {
  const base = computeEggs();
  assert.ok(computeEggs({ layPct: 35 }).wagePrice > base.wagePrice);
  assert.ok(computeEggs({ feedPerLb: 0.9 }).wagePrice > base.wagePrice);
  assert.ok(computeEggs({ lossPct: 30 }).costPerDozen > base.costPerDozen);
});

test("a dark winter loses money and says so", () => {
  const r = computeEggs({ price: 4, feedPerLb: 0.6, layPct: 45, lossPct: 15 });
  assert.ok(r.afterWageYear < 0);
  assert.equal(summarize(r).status, "warn");
  assert.match(summarize(r).text, /a loss of/);
});

test("scenarios mark exactly one current row", () => {
  const r = computeEggs();
  for (const k of ["priceScenarios", "feedScenarios", "layScenarios"]) assert.equal(r[k].filter((s) => s.current).length, 1, k);
});

test("lay-rate scenarios never exceed 100%", () => {
  for (const s of computeEggs({ layPct: 95 }).layScenarios) assert.ok(s.layPct <= 100);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeEggs({ hens: 0 }), /Hens/);
  assert.throws(() => computeEggs({ layPct: 0 }), /Lay rate/);
  assert.throws(() => computeEggs({ layPct: 101 }), /100%/);
  assert.throws(() => computeEggs({ lossPct: 100 }), /under 100/);
  assert.throws(() => computeEggs({ hoursWeek: 0 }), /Hours per week/);
  assert.throws(() => computeEggs({ price: "abc" }), /Selling price/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
