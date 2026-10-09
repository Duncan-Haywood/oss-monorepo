import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, blendedBottle, sellGrapes, bottleWine, breakEvenSellThrough, breakEvenDtcPrice, requiredBottleNet, breakEvenGrapePrice, breakEvenAcres, sellThroughLadder, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: one acre, 10 tons, no loss, 10 cases a ton, nothing but production and the sale price.
const plain = { ...DEFAULTS, acres: 1, tonsPerAcre: 10, grapePrice: 1000, growCostPerAcre: 0, harvestCostPerTon: 0, casesPerTon: 10, lossPct: 0,
  productionPerCase: 50, laborPerCase: 0, marketingPerCase: 0, dtcPrice: 30, dtcCostPct: 0, wholesalePrice: 30, dtcSharePct: 100, sellThroughPct: 100,
  agingMonths: 0, capitalRatePct: 0, exciseTaxPerCase: 0, fixedOverhead: 0 };

test("parsing and formatting", () => {
  assert.equal(num("$1,234"), 1234);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(12.34), "12.3%");
});

test("selling the fruit is tons x price less growing and picking", () => {
  const g = sellGrapes({ ...plain, growCostPerAcre: 2000, harvestCostPerTon: 100 });
  near(g.revenue, 10000);
  near(g.net, 10000 - 2000 - 1000);
});

test("the wine path: 100 cases x 12 bottles x $30 less $50 a case", () => {
  const w = bottleWine(plain);
  near(w.bottledCases, 100);
  near(w.revenue, 100 * 12 * 30);
  near(w.net, 36000 - 5000);
});

test("blended bottle price nets direct selling cost and mixes in wholesale", () => {
  near(blendedBottle({ ...plain, dtcCostPct: 10, wholesalePrice: 20 }, 40, 50), 0.5 * 40 * 0.9 + 0.5 * 20);
});

test("unsold wine counts as zero revenue but still costs to make; excise only on what sells", () => {
  const w = bottleWine({ ...plain, sellThroughPct: 50, exciseTaxPerCase: 2 });
  near(w.soldCases, 50);
  near(w.revenue, 50 * 12 * 30);
  near(w.excise, 100);
  near(w.production, 5000);
});

test("carry is cost of money on production over the ageing months", () => {
  near(bottleWine({ ...plain, capitalRatePct: 10, agingMonths: 24 }).carry, 100 * 50 * 0.1 * 2);
});

test("process loss shrinks the bottled cases", () => {
  near(bottleWine({ ...plain, lossPct: 10 }).bottledCases, 90);
});

test("break-even sell-through reproduces a tie", () => {
  const s = breakEvenSellThrough({ ...DEFAULTS });
  assert.ok(s > 0 && s < 100);
  near(bottleWine(DEFAULTS, { sellThrough: s }).net, sellGrapes(DEFAULTS).net, 1e-4);
});

test("break-even direct price reproduces a tie", () => {
  const p = breakEvenDtcPrice(DEFAULTS);
  near(bottleWine(DEFAULTS, { dtcPrice: p }).net, sellGrapes(DEFAULTS).net, 1e-4);
});

test("required bottle net and break-even grape price are consistent with a tie", () => {
  const need = requiredBottleNet(DEFAULTS);
  const w = bottleWine(DEFAULTS);
  near(need * w.bottlesSold - w.beyond, sellGrapes(DEFAULTS).revenue, 1e-4);
  const gp = breakEvenGrapePrice(DEFAULTS);
  near(sellGrapes(DEFAULTS, gp).net, w.net, 1e-4);
});

test("break-even acres: fixed overhead is absorbed above it, not below", () => {
  const o = { ...DEFAULTS, dtcSharePct: 70, sellThroughPct: 95, fixedOverhead: 20000, acres: 5 };
  const a = breakEvenAcres(o);
  assert.ok(a > 0 && Number.isFinite(a));
  const net = (acres) => bottleWine(o, { acres }).net - sellGrapes({ ...o, acres }).net;
  near(net(a), 0, 1e-4);
  assert.ok(net(a * 1.5) > 0 && net(a * 0.5) < 0);
});

test("never beating the fruit gives Infinity acres and NaN sell-through", () => {
  const o = { ...DEFAULTS, grapePrice: 20000 };
  assert.equal(breakEvenAcres(o), Infinity);
  assert.ok(Number.isNaN(breakEvenSellThrough(o)));
});

test("sell-through ladder is increasing for the wine path", () => {
  const l = sellThroughLadder(DEFAULTS);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].wine > l[i - 1].wine);
});

test("analyze: defaults produce a result and ladders; bad input is reported, not computed", () => {
  const a = analyze({});
  assert.ok(a.result && a.sellThrough.length && a.directShare.length && a.grapePrice.length && a.yield.length);
  assert.ok(analyze({ acres: 0 }).warnings.length && analyze({ acres: 0 }).result === null);
  assert.ok(analyze({ sellThroughPct: 120 }).result === null);
  assert.ok(analyze({ grapePrice: -5 }).result === null);
});

test("analyze flags a case where fruit wins", () => {
  const a = analyze({ grapePrice: 9000 });
  assert.equal(a.result.winePays, false);
  assert.ok(a.warnings.some((w) => /selling the fruit nets/.test(w)));
});

test("csv has four blocks", () => {
  const csv = toCsv(analyze({}));
  assert.equal(csv.split("\n\n").length, 4);
  assert.match(csv, /sell_through_pct,wine_net,fruit_net/);
});
