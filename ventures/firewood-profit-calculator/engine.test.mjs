import test from "node:test";
import assert from "node:assert/strict";
import { computeFirewood, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: $135.13 cash and 4.95 hours a cord, $300 price, 5% unsold", () => {
  const r = computeFirewood();
  close(r.costPerCord, 135.1333333333333, 1e-6);
  close(r.hoursPerCord, 4.95);
  close(r.revenuePerCord, 285);
  close(r.marginSeason, 8992, 1e-6);
  close(r.afterWageSeason, 1567, 1e-6);
  assert.equal(money(r.profitPerHour), "$30.28");
  assert.equal(money(r.wagePrice), "$272.51");
  assert.equal(money(r.faceCordWagePrice), "$90.84");
  assert.equal(r.biggest.key, "wood");
});

test("the wage price leaves exactly the wage; the cash price leaves zero margin", () => {
  const r = computeFirewood();
  close(computeFirewood({ price: r.wagePrice }).afterWagePerCord, 0, 1e-6);
  close(computeFirewood({ price: r.breakevenPrice }).marginPerCord, 0, 1e-6);
});

test("delivery cost and time scale with miles and fall per cord as the load grows", () => {
  const a = computeFirewood({ miles: 20, cordsPerLoad: 1 });
  const b = computeFirewood({ miles: 20, cordsPerLoad: 2 });
  assert.ok(a.costPerCord > b.costPerCord);
  assert.ok(a.hoursPerCord > b.hoursPerCord);
  close(computeFirewood({ miles: 0, deliveryHrs: 0 }).hoursPerCord, 4);
});

test("unsold wood raises the price needed", () => {
  assert.ok(computeFirewood({ lossPct: 20 }).wagePrice > computeFirewood({ lossPct: 0 }).wagePrice);
});

test("a long-haul, low-price winter loses money and says so", () => {
  const r = computeFirewood({ price: 220, wood: 150, miles: 40, deliveryHrs: 3, lossPct: 15 });
  close(r.afterWagePerCord, -158.6333333333333, 1e-6);
  assert.equal(summarize(r).status, "warn");
  assert.match(summarize(r).text, /a loss of \$158\.63/);
});

test("scenarios mark exactly one current row", () => {
  const r = computeFirewood();
  for (const k of ["priceScenarios", "woodScenarios", "mileScenarios"]) assert.equal(r[k].filter((s) => s.current).length, 1, k);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeFirewood({ cords: 0 }), /Cords cut/);
  assert.throws(() => computeFirewood({ lossPct: 100 }), /under 100/);
  assert.throws(() => computeFirewood({ cordsPerLoad: 0 }), /Cords per load/);
  assert.throws(() => computeFirewood({ processHrs: 0 }), /Processing hours/);
  assert.throws(() => computeFirewood({ price: "abc" }), /Selling price/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
