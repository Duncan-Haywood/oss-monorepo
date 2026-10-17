import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeasons, parseBreaks, tierCost, fitSeasons, fitRange, drawDemand, evalQty, analyze, reportCsv, sampleText, sampleBreaks, invNorm, money } from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b} (tol ${tol})`);
const tiers1 = (c) => [{ min: 1, cost: c }];

test("invNorm matches known quantiles", () => {
  near(invNorm(0.5), 0, 1e-9);
  near(invNorm(0.975), 1.959964, 1e-5);
  near(invNorm(0.1), -1.281552, 1e-5);
  near(invNorm(0.001), -3.090232, 1e-4);
});

test("with no price breaks the optimum is the critical-ratio quantile (known answer)", () => {
  // price 10, cost 4, salvage 1 -> cu 6, co 3, CR 2/3. Demand: median 500, lognormal.
  const r = analyze({ mode: "range", range: { low: 350, likely: 500, high: 714.3 }, widen: 1, tiers: tiers1(4), price: 10, salvage: 1 });
  assert.ok(!r.error, r.error);
  const s = r.fit.s;
  const exact = 500 * Math.exp(s * invNorm(2 / 3));
  near(r.best.q, exact, exact * 0.02, "newsvendor quantile");
  near(r.textbook.criticalRatio, 2 / 3, 1e-12);
  near(r.textbook.q, exact, exact * 0.02, "textbook reference");
});

test("a price break that is worth it moves the order up to the break, one that is not does not", () => {
  const base = { mode: "range", range: { low: 300, likely: 500, high: 800 }, price: 10, salvage: 0 };
  const worth = analyze({ ...base, tiers: [{ min: 100, cost: 5 }, { min: 600, cost: 4.4 }] });
  assert.equal(worth.best.q, 600);
  const notWorth = analyze({ ...base, tiers: [{ min: 100, cost: 5 }, { min: 600, cost: 4.98 }] });
  assert.ok(notWorth.best.q < 600, String(notWorth.best.q));
  assert.equal(worth.tierTable.length, 2);
  assert.ok(worth.tierTable[1].best.q >= 600);
});

test("minimum order quantity is never undercut", () => {
  const r = analyze({ mode: "range", range: { low: 20, likely: 30, high: 50 }, tiers: [{ min: 200, cost: 2 }], price: 10, salvage: 0 });
  assert.ok(r.best.q >= 200);
});

test("when no order can make money the tool says so", () => {
  const r = analyze({ mode: "range", range: { low: 10, likely: 20, high: 40 }, tiers: tiers1(9), price: 10, salvage: 0, fixed: 500 });
  assert.ok(r.best.expProfit < 0);
  assert.ok(r.warnings.some((w) => /No order quantity/.test(w)));
});

test("expected profit matches a hand calculation on fixed demand", () => {
  const e = { price: 10, salvage: 2, holding: 0.5, goodwill: 1, fixed: 20, tiers: tiers1(4) };
  const r = evalQty(100, [60, 100, 140], e);
  // D=60: sales 60, left 40 -> 600+40*1.5-0-420 = 240; D=100: 1000-420=580; D=140: 1000-40-420=540
  near(r.expProfit, (240 + 580 + 540) / 3, 1e-9);
  near(r.pSellOut, 2 / 3, 1e-9);
  near(r.expLeftover, 40 / 3, 1e-9);
  near(r.expShort, 40 / 3, 1e-9);
  near(r.fillRate, (60 + 100 + 100) / 300, 1e-9);
});

test("censored seasons raise the fitted demand above the naive fit", () => {
  const plain = [{ units: 400 }, { units: 500 }, { units: 450 }, { units: 480 }, { units: 420 }];
  const cens = plain.map((s, i) => ({ ...s, censored: i === 1 || i === 3 }));
  const a = fitSeasons(plain), b = fitSeasons(cens);
  assert.ok(b.m > a.m, `${b.m} > ${a.m}`);
  assert.equal(b.censored, 2);
});

test("EM recovers the parameters of a censored lognormal", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const cap = Math.exp(6.1);
  const seasons = [];
  for (let i = 0; i < 4000; i++) {
    const z = invNorm(Math.min(0.999999, Math.max(1e-6, rnd())));
    const d = Math.exp(6 + 0.3 * z);
    seasons.push(d > cap ? { units: cap, censored: true } : { units: d, censored: false });
  }
  const f = fitSeasons(seasons);
  near(f.m, 6, 0.03, "mu");
  near(f.s, 0.3, 0.03, "sigma");
});

test("with few seasons the forecast is wider than with many of the same spread", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ units: 500 * Math.exp(0.25 * invNorm((i + 0.5) / n)) }));
  const w = (n) => { const d = drawDemand(fitSeasons(mk(n))); return d[Math.floor(0.9 * d.length)] / d[Math.floor(0.1 * d.length)]; };
  assert.ok(w(3) > w(12), `${w(3)} > ${w(12)}`);
});

test("results are deterministic", () => {
  const p = parseSeasons(sampleText()), b = parseBreaks(sampleBreaks());
  const o = { mode: "history", seasons: p.seasons, tiers: b.tiers, price: 14, salvage: 3, holding: 0.2, fixed: 40 };
  const a = analyze(o), c = analyze(o);
  assert.equal(a.best.q, c.best.q);
  assert.equal(a.best.expProfit, c.best.expProfit);
});

test("the sample analyses cleanly, with a back-test, sensitivity and a cautious order", () => {
  const p = parseSeasons(sampleText()), b = parseBreaks(sampleBreaks());
  const r = analyze({ mode: "history", seasons: p.seasons, tiers: b.tiers, price: 14, salvage: 3, holding: 0.2, fixed: 40 });
  assert.ok(!r.error, r.error);
  assert.ok(r.best.expProfit > 0);
  assert.ok(r.cautious.q <= r.best.q || r.cautious.cvar10 >= r.best.cvar10);
  assert.ok(r.backtest && r.backtest.rows.length >= 3);
  assert.equal(r.sens.length, 5);
  assert.equal(r.sens[2].regret, 0);
  assert.ok(r.sens.every((s) => s.regret >= -1e-6));
  assert.ok(r.evpi >= 0);
  assert.ok(reportCsv(r).startsWith("quantity,unit_cost"));
  assert.ok(reportCsv(r).trim().split("\n").length > 50);
});

test("refusals: too few seasons, all sold out, bad prices", () => {
  const t = tiers1(4);
  assert.match(analyze({ mode: "history", seasons: [{ units: 100 }, { units: 120 }], tiers: t, price: 10 }).error, /at least 3/);
  assert.match(analyze({ mode: "history", seasons: [{ units: 100, censored: true }, { units: 120, censored: true }, { units: 90 }], tiers: t, price: 10 }).error, /two seasons/);
  assert.match(analyze({ mode: "range", range: { low: 5, likely: 4, high: 9 }, tiers: t, price: 10 }).error, /low < likely < high/);
  assert.match(analyze({ mode: "range", range: { low: 5, likely: 7, high: 9 }, tiers: t, price: 10, salvage: 12 }).error, /above the selling price/);
  assert.match(analyze({ mode: "range", range: { low: 5, likely: 7, high: 9 }, tiers: t, price: 0 }).error, /price/);
});

test("parseSeasons reads labels, stars and sold-out flags", () => {
  const p = parseSeasons("units\nSpring 2024, 500\n610*\nHoliday, 420, sold out\nbad line\n0");
  assert.equal(p.seasons.length, 3);
  assert.equal(p.seasons[0].units, 500);
  assert.equal(p.seasons[0].label, "Spring 2024");
  assert.equal(p.seasons[1].censored, true);
  assert.equal(p.seasons[2].censored, true);
  assert.equal(p.seasons[2].units, 420);
  assert.match(p.warnings[0], /skipped/);
  assert.match(parseSeasons("").error, /Enter/);
});

test("parseBreaks reads tiers, a bare cost, and rejects nonsense", () => {
  assert.deepEqual(parseBreaks("4.50").tiers, [{ min: 1, cost: 4.5 }]);
  const b = parseBreaks("600:5.20\n100 6.8\n300,5.9");
  assert.deepEqual(b.tiers.map((t) => t.min), [100, 300, 600]);
  assert.equal(tierCost(b.tiers, 299), 6.8);
  assert.equal(tierCost(b.tiers, 600), 5.2);
  assert.equal(tierCost(b.tiers, 50), null);
  assert.match(parseBreaks("100:5\n100:4").error, /same quantity/);
  assert.match(parseBreaks("abc:def").error, /Could not read/);
});

test("fitRange widens the spread and money formats", () => {
  assert.ok(fitRange({ low: 300, likely: 500, high: 800, widen: 1.5 }).s > fitRange({ low: 300, likely: 500, high: 800, widen: 1 }).s);
  assert.equal(money(1234.5), "$1,234.50");
});
