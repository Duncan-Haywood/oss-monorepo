import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, visitCost, visit, minVisitPrice, season, lifetime, route, priceLadder, sensitivity, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const flat = { ...DEFAULTS, yardSqft: 10000, productPer1k: 2, onSiteMin: 30, driveMin: 0, laborHour: 20, truckHour: 0,
  callbackPct: 0, overheadPct: 0, cardPct: 0, prepayDiscountPct: 0 };

test("direct cost adds product, labour and truck time", () => {
  const c = visitCost(flat);
  near(c.product, 20);
  near(c.labor, 10);
  near(c.truck, 0);
  near(c.direct, 30);
});

test("free re-treats add their share to the direct cost", () => {
  near(visitCost({ ...flat, callbackPct: 10 }).direct, 33);
});

test("overhead and card fees scale with the price", () => {
  const v = visit({ ...flat, overheadPct: 10, cardPct: 5 }, 100);
  near(v.fees, 15);
  near(v.profit, 55);
  near(v.margin, 55);
});

test("the minimum price reproduces the wanted margin", () => {
  const o = { ...flat, overheadPct: 10, cardPct: 5, wantPct: 40 };
  const p = minVisitPrice(o);
  near(visit(o, p).margin, 40, 1e-9);
});

test("the minimum list price survives a prepay discount", () => {
  const o = { ...DEFAULTS, prepayDiscountPct: 10 };
  const p = minVisitPrice(o, o.wantPct, 10);
  near(season(o, p).margin, o.wantPct, 1e-9);
  assert.ok(p > minVisitPrice(o));
});

test("an impossible margin returns Infinity rather than a negative price", () => {
  assert.equal(minVisitPrice({ ...DEFAULTS, overheadPct: 50, cardPct: 20 }, 40), Infinity);
});

test("season price is visits times price less the prepay discount", () => {
  const s = season({ ...flat, visitsPerSeason: 6, prepayDiscountPct: 10 }, 100);
  near(s.list, 600);
  near(s.paid, 540);
  near(s.direct, 180);
  near(s.profit, 360);
});

test("renewals: zero keeps one season, full renewal keeps the cap", () => {
  near(lifetime({ ...flat, renewPct: 0, seasonsCap: 8 }).expectedSeasons, 1);
  near(lifetime({ ...flat, renewPct: 100, seasonsCap: 8 }).expectedSeasons, 8);
  near(lifetime({ ...flat, renewPct: 50, seasonsCap: 3 }).expectedSeasons, 1 + 0.5 + 0.25);
});

test("route: a day's profit and the customers one truck can serve", () => {
  const o = { ...flat, stopsPerDay: 10, routeDaysPerWeek: 4, seasonWeeks: 20, visitsPerSeason: 5, startupCost: 3000 };
  const r = route(o, 100);
  near(r.dayRevenue, 1000);
  near(r.dayProfit, 700);
  near(r.visitsSeason, 800);
  near(r.customers, 160);
  assert.equal(r.breakEvenCustomers, Math.ceil(3000 / (500 * 0.7)));
});

test("break-even customers is Infinity when a season loses money", () => {
  assert.equal(route({ ...flat, startupCost: 1000 }, 10).breakEvenCustomers, Infinity);
});

test("ladder profit rises with price; sensitivity shows only losses from worse inputs", () => {
  const l = priceLadder(DEFAULTS);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].visitProfit > l[i - 1].visitProfit);
  for (const x of sensitivity(DEFAULTS)) assert.ok(x.delta < 0, x.label);
});

test("analyze with defaults returns a result and flags a price below target", () => {
  const a = analyze({});
  assert.ok(a.result);
  assert.ok(a.warnings.some((w) => /below/.test(w)));
});

test("analyze refuses impossible inputs with a warning, not a crash", () => {
  assert.equal(analyze({ yardSqft: 0 }).result, null);
  assert.equal(analyze({ overheadPct: 60, cardPct: 30, wantPct: 20 }).result, null);
});

test("helpers: num strips symbols, money and pct round", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(12.345), "12.3%");
});

test("csv carries the headline lines", () => {
  const csv = toCsv(analyze({}));
  assert.match(csv, /^line,amount/);
  assert.match(csv, /min_visit_price_for_target_margin/);
  assert.equal(toCsv({ result: null }), "");
});

test("lifetime: a huge seasons cap returns at once and matches the loop for small caps", () => {
  const loop = (r, cap) => { let t = 0; for (let n = 1; n <= cap; n++) t += Math.pow(r, n - 1); return t; };
  for (const [renew, cap] of [[60, 8], [100, 5], [0, 4], [85, 0], [70, 3.7]]) {
    const got = lifetime({ ...DEFAULTS, renewPct: renew, seasonsCap: cap }).expectedSeasons;
    assert.ok(Math.abs(got - loop(renew / 100, cap)) < 1e-9, `${renew}/${cap}`);
  }
  assert.ok(Number.isFinite(lifetime({ ...DEFAULTS, seasonsCap: 1e12 }).expectedSeasons));
});
