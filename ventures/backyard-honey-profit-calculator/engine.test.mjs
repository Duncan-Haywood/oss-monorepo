import test from "node:test";
import assert from "node:assert/strict";
import { computeHoney, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: 10 hives at 50 lb with 10% lost is 450 lb sold and a 1745 cash cost", () => {
  const r = computeHoney();
  close(r.lbsHarvest, 500);
  close(r.lbsSold, 450);
  close(r.costYear, 1745);
  close(r.hoursYear, 200);
  assert.equal(money(r.costPerLb), "$3.88");
  assert.equal(money(r.profitPerHour), "$13.78");
  assert.equal(money(r.wagePrice), "$12.77");
  assert.equal(r.biggest.key, "jars");
});

test("the wage price leaves exactly the wage; the cash price leaves zero margin", () => {
  const r = computeHoney();
  close(computeHoney({ price: r.wagePrice }).afterWageYear, 0, 1e-6);
  close(computeHoney({ price: r.breakevenPrice }).marginYear, 0, 1e-6);
});

test("a poor crop and a bad winter both raise the price needed", () => {
  const base = computeHoney();
  assert.ok(computeHoney({ yieldLbs: 25 }).wagePrice > base.wagePrice);
  assert.ok(computeHoney({ winterLossPct: 60 }).wagePrice > base.wagePrice);
  assert.ok(computeHoney({ lossPct: 30 }).costPerLb > base.costPerLb);
});

test("a bad year loses money and says so", () => {
  const r = computeHoney({ price: 8, yieldLbs: 25, winterLossPct: 50, lossPct: 15 });
  assert.ok(r.afterWageYear < 0);
  assert.equal(summarize(r).status, "warn");
  assert.match(summarize(r).text, /a loss of/);
});

test("scenarios mark exactly one current row", () => {
  const r = computeHoney();
  for (const k of ["priceScenarios", "yieldScenarios", "winterScenarios"]) assert.equal(r[k].filter((s) => s.current).length, 1, k);
});

test("winter-loss scenarios never exceed 100%", () => {
  for (const s of computeHoney({ winterLossPct: 90 }).winterScenarios) assert.ok(s.winterLossPct <= 100);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeHoney({ hives: 0 }), /Hives/);
  assert.throws(() => computeHoney({ yieldLbs: 0 }), /Honey per hive/);
  assert.throws(() => computeHoney({ winterLossPct: 101 }), /100%/);
  assert.throws(() => computeHoney({ lossPct: 100 }), /under 100/);
  assert.throws(() => computeHoney({ hoursPerHive: 0 }), /Hours per hive/);
  assert.throws(() => computeHoney({ price: "abc" }), /Selling price/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
