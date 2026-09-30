import { test } from "node:test";
import assert from "node:assert/strict";
<<<<<<< HEAD
import {
  parseDateCell, parseNumber, parseFlag, parseData, tCdf, tQuantile, ols, optimalPriceRaw, optimum,
  priceVariation, analyze, backtest, whatIf, whatIfCsv, simulateDemand, sampleText, num, pct, MIN_ROWS,
} from "./calc.mjs";

const toText = (rows, extra = "") => ["date,price,units" + extra, ...rows.map((r) => `${r.y}-${String(r.m).padStart(2, "0")}-${String(r.d).padStart(2, "0")},${r.price},${r.units}`)].join("\n");

test("t quantiles match published tables", () => {
  assert.ok(Math.abs(tQuantile(0.95, 10) - 2.2281) < 1e-3);
  assert.ok(Math.abs(tQuantile(0.95, 30) - 2.0423) < 1e-3);
  assert.ok(Math.abs(tQuantile(0.95, 5) - 2.5706) < 1e-3);
  assert.ok(Math.abs(tQuantile(0.95, 100000) - 1.96) < 2e-3);
  assert.ok(Math.abs(tCdf(0, 7) - 0.5) < 1e-12);
  assert.ok(Math.abs(tCdf(2.2281, 10) - 0.975) < 1e-3);
});

test("ols recovers a line and its R squared, and refuses a singular design", () => {
  const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
  const y = [1, 3, 5, 7, 9.5];
  const f = ols(X, y);
  assert.ok(Math.abs(f.beta[1] - 2.1) < 1e-9);
  assert.ok(f.r2 > 0.99);
  assert.equal(ols([[1, 2], [1, 2], [1, 2]], [1, 2, 3]), null);
});

test("date and number parsing", () => {
  assert.deepEqual(parseDateCell("2024-03-05"), { y: 2024, m: 3, d: 5 });
  assert.deepEqual(parseDateCell("Mar 5, 2024"), { y: 2024, m: 3, d: 5 });
  assert.deepEqual(parseDateCell("2024-03"), { y: 2024, m: 3, d: 1 });
  assert.equal(parseDateCell("2024-02-31"), null);
  assert.equal(parseNumber("$1,299.50"), 1299.5);
  assert.equal(parseNumber("12,5", true), 12.5);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseFlag("Yes"), true);
  assert.equal(parseFlag("0"), false);
  assert.equal(parseFlag("maybe"), null);
});

test("parseData reads headers in any order, optional cost and promo, and skips bad rows", () => {
  const p = parseData("Units Sold,Date,Unit Cost,Price,On Sale\n120,2024-01-07,8,19.99,no\n150,2024-01-14,8,17.99,yes\nx,2024-01-21,8,19.99,no\n0,2024-01-28,8,19.99,no\n90,2024-02-04,8,21.99,no");
  assert.equal(p.obs.length, 3);
  assert.equal(p.obs[1].price, 17.99);
  assert.equal(p.obs[1].units, 150);
  assert.equal(p.obs[1].cost, 8);
  assert.equal(p.obs[1].promo, true);
  assert.equal(p.skipped, 1);
  assert.equal(p.nonPositive, 1);
  assert.ok(p.warnings.some((w) => /zero/.test(w)));
  assert.ok(p.columns.hasCost && p.columns.hasPromo);
});

test("parseData without a header uses date, price, units, cost, promo order; semicolon and decimal comma", () => {
  const a = parseData("2024-01-07,19.99,120,8,0\n2024-01-14,17.99,150,8,1");
  assert.equal(a.obs[0].units, 120);
  assert.equal(a.obs[0].cost, 8);
  assert.equal(a.obs[1].promo, true);
  const b = parseData("date;price;units\n07.01.2024;19,99;120\n14.01.2024;17,99;150");
  assert.equal(b.obs[0].price, 19.99);
  assert.equal(b.obs[0].m, 1);
  assert.match(parseData("foo,bar\n1,2").error, /Could not find/);
  assert.match(parseData("").error, /Paste/);
  assert.match(parseData("date,price,units\nnope,1,2").error, /No rows/);
});

test("closed-form optimal price: c*e/(1+e), infinite when inelastic", () => {
  assert.equal(optimalPriceRaw(-2, 10), 20);
  assert.ok(Math.abs(optimalPriceRaw(-3, 12) - 18) < 1e-12);
  assert.equal(optimalPriceRaw(-0.8, 10), Infinity);
  assert.equal(optimalPriceRaw(-1, 10), Infinity);
});

test("the optimum really maximises profit under constant elasticity", () => {
  const e = -2.5, c = 6, k = 1000;
  const profit = (p) => (p - c) * k * Math.pow(p, e);
  const pStar = optimalPriceRaw(e, c);
  for (const d of [0.9, 0.97, 1.03, 1.1]) assert.ok(profit(pStar) > profit(pStar * d));
});

test("optimum caps to the tested range and widens with the confidence interval", () => {
  const inside = optimum({ e: -2, eLo: -2.6, eHi: -1.6, cost: 10, pMin: 10, pMax: 40 });
  assert.equal(inside.status, "interior");
  assert.equal(inside.point, 20);
  assert.ok(Math.abs(inside.low - optimalPriceRaw(-2.6, 10)) < 1e-9);
  assert.ok(Math.abs(inside.high - optimalPriceRaw(-1.6, 10)) < 1e-9);
  const capped = optimum({ e: -1.2, eLo: -1.5, eHi: -0.9, cost: 10, pMin: 12, pMax: 30 });
  assert.equal(capped.status, "capped-high");
  assert.equal(capped.point, 30);
  assert.equal(capped.high, 30);
  assert.equal(capped.ciAllowsInelastic, true);
  const low = optimum({ e: -6, eLo: -8, eHi: -5, cost: 10, pMin: 14, pMax: 30 });
  assert.equal(low.status, "capped-low");
  assert.equal(low.point, 14);
  assert.equal(optimum({ e: -2, eLo: -3, eHi: -1, cost: null, pMin: 1, pMax: 2 }).status, "no-cost");
  assert.equal(optimum({ e: 0.4, eLo: -0.2, eHi: 1, cost: 5, pMin: 1, pMax: 9 }).status, "not-computed");
});

test("recovers a known elasticity from noise-free data exactly", () => {
  const rows = simulateDemand({ n: 40, elasticity: -2, noise: 0, seed: 3 }).map((r) => ({ ...r, units: 400 * Math.pow(r.price / 25, -2) }));
  const r = analyze(rows, { trend: false });
  assert.ok(Math.abs(r.elasticity.point + 2) < 1e-6);
  assert.ok(r.r2 > 0.999999);
});

test("95% interval covers the true elasticity about 95% of the time", () => {
  let cover = 0;
  const trials = 200;
  for (let s = 1; s <= trials; s++) {
    const p = parseData(toText(simulateDemand({ n: 40, elasticity: -1.8, noise: 0.1, seed: s })));
    const r = analyze(p.obs, { trend: false });
    if (r.elasticity.lo <= -1.8 && -1.8 <= r.elasticity.hi) cover++;
  }
  assert.ok(cover / trials > 0.91 && cover / trials < 0.99, `coverage ${cover / trials}`);
});

test("a trend that drifts with price biases the naive fit and the trend control fixes it", () => {
  // Price falls over the period while demand grows 60% a year: a naive fit calls demand far more elastic than it is.
  const rows = simulateDemand({ n: 78, elasticity: -1.2, noise: 0.03, seed: 5, trend: 0.47, pricePath: "drifting", priceSteps: [0.92, 1, 1.08] });
  const naive = analyze(rows, { trend: false });
  const controlled = analyze(rows, { trend: true });
  assert.ok(Math.abs(controlled.elasticity.point + 1.2) < 0.25, `controlled ${controlled.elasticity.point}`);
  assert.ok(Math.abs(naive.elasticity.point + 1.2) > Math.abs(controlled.elasticity.point + 1.2) + 0.5, `naive ${naive.elasticity.point}`);
  assert.ok(controlled.warnings.some((w) => /strongly correlated/.test(w)));
});

test("month dummies absorb a seasonal pattern that otherwise contaminates price", () => {
  const season = [0.6, 0.65, 0.8, 1, 1.15, 1.3, 1.4, 1.35, 1.05, 0.9, 0.8, 1.2];
  const base = simulateDemand({ n: 104, elasticity: -1.5, noise: 0, seed: 11, priceSteps: [0.9, 1, 1.1] });
  // Policy confounder: prices are raised in the strong months.
  const rows = base.map((r, i) => {
    const price = +(r.price * (season[r.m - 1] > 1.1 ? 1.15 : 1)).toFixed(2);
    const units = Math.max(1, Math.round(400 * Math.pow(price / 25, -1.5) * season[r.m - 1] * Math.exp(0.03 * Math.sin(i * 1.7))));
    return { ...r, price, units };
  });
  const without = analyze(rows, { trend: false, seasonality: false });
  const withS = analyze(rows, { trend: false, seasonality: true });
  assert.ok(withS.columns.some((c) => / vs /.test(c)));
  assert.ok(Math.abs(withS.elasticity.point + 1.5) < 0.15, `with ${withS.elasticity.point}`);
  assert.ok(Math.abs(without.elasticity.point + 1.5) > Math.abs(withS.elasticity.point + 1.5), `without ${without.elasticity.point}`);
});

test("seasonality is not fitted on under a year of history, with a note", () => {
  const rows = simulateDemand({ n: 20, elasticity: -1.5, noise: 0.05, seed: 2 });
  const r = analyze(rows, { trend: false, seasonality: true });
  assert.ok(!r.columns.some((c) => / vs /.test(c)));
  assert.ok(r.warnings.some((w) => /about a year/.test(w)));
});

test("promo flag is used as a control when it varies, and dropped with a note when it does not", () => {
  const rows = simulateDemand({ n: 60, elasticity: -1.5, noise: 0.04, seed: 9, promoLift: 1.6 });
  const r = analyze(rows, { trend: false });
  assert.ok(r.columns.includes("promo flag"));
  assert.ok(r.controls.find((c) => c.name === "promo flag").coef > 0.2);
  const few = rows.map((x, i) => ({ ...x, promo: i === 0 }));
  const r2 = analyze(few, { trend: false });
  assert.ok(!r2.columns.includes("promo flag"));
  assert.ok(r2.warnings.some((w) => /promo column/.test(w)));
});

test("too little price variation is flagged and the optimum is withheld", () => {
  const rows = simulateDemand({ n: 40, elasticity: -1.8, noise: 0.05, seed: 2, priceSteps: [0.99, 1, 1.01] }).map((r) => ({ ...r, cost: 10 }));
  const r = analyze(rows, { trend: false });
  assert.equal(r.identification.level, "not_identified");
  assert.match(r.identification.reasons[0], /barely moved/);
  assert.equal(r.optimum.status, "withheld");
});

test("a single price level is an error, and too few rows is an error", () => {
  const same = simulateDemand({ n: 30, pricePath: "flat", seed: 1 });
  assert.match(analyze(same, {}).error, /same price/);
  assert.match(analyze(same.slice(0, MIN_ROWS - 1), {}).error, /at least/);
});

test("price that moves only with the promo flag is not reported as cleanly identified", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const promo = i % 4 === 0;
    const d = new Date(Date.UTC(2024, 0, 1) + i * 7 * 86400000);
    rows.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), day: d.getTime() / 86400000, price: promo ? 20 : 25, units: promo ? 160 + (i % 3) : 100 + (i % 5), cost: null, promo });
  }
  const r = analyze(rows, { trend: false });
  assert.ok(r.identification.level !== "ok" || r.warnings.some((w) => /promo flag was dropped/.test(w)));
});

test("positive estimated elasticity is called out and gets no recommendation", () => {
  const rows = simulateDemand({ n: 40, elasticity: 0.8, noise: 0.03, seed: 4 }).map((r) => ({ ...r, cost: 10 }));
  const r = analyze(rows, { trend: false });
  assert.ok(r.elasticity.point > 0);
  assert.equal(r.reading, "not-negative");
  assert.equal(r.optimum.status, "not-computed");
  assert.ok(r.warnings.some((w) => /not negative/.test(w)));
});

test("profit-maximising price from a full run is in the tested range and inside its own CI range", () => {
  const rows = simulateDemand({ n: 60, elasticity: -2.4, noise: 0.05, seed: 6, priceSteps: [0.8, 0.9, 1, 1.15, 1.3] }).map((r) => ({ ...r, cost: 12 }));
  const r = analyze(rows, { trend: false });
  const o = r.optimum;
  assert.ok(o.point >= r.variation.min && o.point <= r.variation.max);
  assert.ok(o.low <= o.point && o.point <= o.high);
  assert.equal(r.costSource, "column");
  assert.ok(Math.abs(o.rawPoint - (12 * 2.4) / 1.4) < 4);
  assert.ok(r.profitAtOptimum.change >= -1e-6);
});

test("entered unit cost overrides the column", () => {
  const rows = simulateDemand({ n: 40, elasticity: -2, noise: 0.05, seed: 6 }).map((r) => ({ ...r, cost: 5 }));
  const r = analyze(rows, { trend: false, cost: 9 });
  assert.equal(r.cost, 9);
  assert.equal(r.costSource, "entered");
});

test("what-if table: units follow the power law, flags out-of-range rows, and includes extra prices", () => {
  const ref = { price: 20, units: 100 };
  const t = whatIf({ ref, e: -2, eLo: -3, eHi: -1, cost: 10, pMin: 19, pMax: 21, extra: [20.5] });
  const base = t.find((x) => x.isReference);
  assert.equal(base.units, 100);
  assert.equal(base.profitChange, 0);
  const up = t.find((x) => Math.abs(x.price - 22) < 1e-9);
  assert.ok(Math.abs(up.units - 100 * 1.1 ** -2) < 1e-9);
  assert.equal(up.outside, true);
  assert.ok(up.unitsLow < up.units && up.units < up.unitsHigh);
  assert.ok(t.some((x) => x.price === 20.5));
  const noCost = whatIf({ ref, e: -2, eLo: -3, eHi: -1, cost: null, pMin: 1, pMax: 99 });
  assert.equal(noCost[0].profit, null);
});

test("self back-test: a real price signal helps, an irrelevant price does not", () => {
  const good = parseData(toText(simulateDemand({ n: 60, elasticity: -2, noise: 0.05, seed: 8, priceSteps: [0.8, 0.9, 1, 1.1, 1.25] })));
  const bt = analyze(good.obs, { trend: false, holdout: 10 }).backtest;
  assert.equal(bt.available, true);
  assert.equal(bt.holdout, 10);
  assert.equal(bt.verdict, "helps");
  assert.equal(bt.rows.length, 10);
  assert.ok(bt.model.mape < bt.noPrice.mape);
  const flat = simulateDemand({ n: 60, elasticity: 0, noise: 0.08, seed: 13, priceSteps: [0.8, 0.9, 1, 1.1, 1.25] });
  const bt2 = analyze(flat, { trend: false, holdout: 12 }).backtest;
  assert.notEqual(bt2.verdict, "helps");
  assert.ok(bt2.message.length > 20);
});

test("back-test is honest when there is too little data", () => {
  const rows = simulateDemand({ n: 12, elasticity: -2, noise: 0.05, seed: 8 });
  const bt = backtest(rows, { trend: false }, 6);
  assert.equal(bt.available, false);
});

test("back-test does not look at the held-out rows when fitting", () => {
  const rows = simulateDemand({ n: 50, elasticity: -2, noise: 0.05, seed: 21 });
  const a = backtest(rows, { trend: false }, 8);
  const b = backtest(rows.map((r, i) => (i >= 42 ? { ...r, units: r.units * 3 } : r)), { trend: false }, 8);
  assert.equal(a.trainElasticity, b.trainElasticity);
});

test("priceVariation summarises the range", () => {
  const v = priceVariation([{ price: 10 }, { price: 11 }, { price: 12 }, { price: 10 }]);
  assert.equal(v.min, 10);
  assert.equal(v.max, 12);
  assert.equal(v.distinct, 3);
  assert.ok(Math.abs(v.rangePct - 0.2) < 1e-12);
});

test("the built-in example parses, fits and is identified", () => {
  const p = parseData(sampleText());
  assert.equal(p.obs.length, 52);
  const r = analyze(p.obs, { trend: true });
  assert.equal(r.identification.level, "ok");
  assert.ok(r.elasticity.lo < -1.7 && r.elasticity.hi > -1.7);
  assert.equal(r.costSource, "column");
  assert.match(whatIfCsv(r), /^price,change_vs_reference/);
  assert.equal(whatIfCsv(r).trim().split("\n").length, r.whatIf.length + 1);
});

test("formatting helpers", () => {
  assert.equal(num(1234.5), "1,235");
  assert.equal(num(null), "n/a");
  assert.equal(pct(0.1234), "12.3%");
=======
import { parseRows, parseDate, analyze, sampleText, reportCsv, ols, tQuantile, normQuantile } from "./calc.mjs";

function series(elasticity, { n = 60, noise = 0, seed = 1, levels = [20, 22, 24, 26, 28] } = {}) {
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  return Array.from({ length: n }, (_, i) => {
    const price = levels[Math.floor(i / 3) % levels.length] + (i % 2) * 0.5;
    const eps = noise * (rnd() - 0.5) * 2;
    return { t: i, price, units: 100 * Math.pow(price / 24, elasticity) * Math.exp(eps) };
  });
}

test("OLS recovers an exact line", () => {
  const X = [1, 2, 3, 4].map((x) => [1, x]);
  const f = ols(X, [3, 5, 7, 9]);
  assert.ok(Math.abs(f.beta[0] - 1) < 1e-9 && Math.abs(f.beta[1] - 2) < 1e-9);
});

test("quantile helpers match tables", () => {
  assert.ok(Math.abs(normQuantile(0.975) - 1.95996) < 1e-4);
  assert.ok(Math.abs(tQuantile(0.975, 10) - 2.228) < 0.01);
  assert.ok(Math.abs(tQuantile(0.975, 60) - 2.0003) < 0.01);
});

test("noise-free constant-elasticity data returns the exact elasticity", () => {
  for (const e of [-0.6, -1.5, -3]) {
    const r = analyze(series(e), { trend: false, season: false });
    assert.ok(Math.abs(r.elasticity - e) < 1e-6, `${e} got ${r.elasticity}`);
  }
});

test("noisy data: the interval covers the truth and the verdict is usable", () => {
  const r = analyze(series(-1.8, { noise: 0.08, n: 80 }), { trend: false, season: false, dated: false });
  assert.ok(r.ci95[0] < -1.8 && -1.8 < r.ci95[1], JSON.stringify(r.ci95));
  assert.equal(r.verdict, "usable");
  assert.equal(r.type, "elastic");
});

test("optimum price matches c*e/(e-1) when it lies inside the tested range", () => {
  const rows = series(-2, { levels: [16, 20, 24, 28, 32] });
  const r = analyze(rows, { trend: false, season: false, cost: 10 });
  const expected = (10 * -2) / (-2 + 1); // 20
  assert.ok(Math.abs(r.optimum.price - expected) < 0.2, r.optimum.price);
  assert.ok(Math.abs(r.optimum.unconstrained - 20) < 1e-6);
  assert.equal(r.optimum.atBoundary, false);
});

test("inelastic demand pushes the optimum to the top of the tested range and says so", () => {
  const r = analyze(series(-0.5), { trend: false, season: false, cost: 10 });
  assert.equal(r.optimum.atBoundary, true);
  assert.ok(Math.abs(r.optimum.price - r.priceMax) < 0.3);
  assert.equal(r.optimum.unconstrained, null);
  assert.ok(r.warnings.some((w) => /edge of the prices/.test(w)));
});

test("a flat price is refused, not answered", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ t: i, price: 25, units: 100 + i }));
  assert.match(analyze(rows, {}).error, /barely moved/);
  const two = Array.from({ length: 30 }, (_, i) => ({ t: i, price: i % 2 ? 25 : 26, units: 100 }));
  assert.match(analyze(two, {}).error, /barely moved/);
});

test("too few rows is refused", () => {
  assert.match(analyze(series(-1).slice(0, 8), {}).error, /At least 12 rows/);
});

test("a positive slope (price raised in busy weeks) is flagged unidentified", () => {
  const rows = series(0, { n: 60 }).map((r, i) => ({ ...r, units: 50 + r.price * 4 + (i % 3) }));
  const r = analyze(rows, { trend: false, season: false });
  assert.equal(r.verdict, "unidentified");
  assert.ok(r.warnings.some((w) => /unidentified/.test(w)));
  assert.equal(r.optimum, undefined);
});

test("a steady trend in both price and demand is absorbed by the trend control", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ t: i, price: 20 + i * 0.1 + (i % 2) * 0.3, units: 100 * Math.exp(0.012 * i) * Math.pow((20 + i * 0.1) / 20, -1.2) }));
  const without = analyze(rows, { trend: false, season: false });
  const withT = analyze(rows, { trend: true, season: false });
  assert.ok(withT.warnings.some((w) => /straight line/.test(w)));
  assert.ok(Math.abs(withT.elasticity + 1.2) < Math.abs(without.elasticity + 1.2));
});

test("bootstrap is deterministic for a seed and changes with another", () => {
  const rows = series(-1.6, { noise: 0.1 });
  const a = analyze(rows, { cost: 9, trend: false, season: false });
  const b = analyze(rows, { cost: 9, trend: false, season: false });
  const c = analyze(rows, { cost: 9, trend: false, season: false, seed: 5 });
  assert.deepEqual(a.ci80, b.ci80);
  assert.notDeepEqual(a.ci80, c.ci80);
});

test("holdout: price helps predict when it drives demand, and not when it does not", () => {
  const good = analyze(series(-2, { noise: 0.05, n: 80 }), { trend: false, season: false });
  assert.equal(good.holdout.helps, true);
  const rows = series(0, { noise: 0.2, n: 80, seed: 9 });
  const bad = analyze(rows, { trend: false, season: false });
  assert.notEqual(bad.verdict, "usable");
});

test("recovers the known elasticity of the built-in sample within its interval", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 64);
  const r = analyze(p.rows, { dated: true, cost: 10, currentPrice: 29 });
  assert.ok(r.ci95[0] < -1.8 && r.ci95[1] > -1.8, JSON.stringify(r.ci95));
  assert.equal(r.verdict, "usable");
  assert.ok(r.optimum.gain > 0);
  assert.ok(r.optimum.price < 29, "current 29 is above the profit-maximising price");
});

test("without a cost there is revenue advice and no optimum", () => {
  const r = analyze(series(-0.5), { trend: false, season: false });
  assert.equal(r.optimum, undefined);
  assert.match(r.revenueAdvice, /raising price increased revenue/);
});

test("scenarios: a 10% rise scales units by 1.1^e and flags untested prices", () => {
  const r = analyze(series(-1.5), { trend: false, season: false, currentPrice: 24, cost: 10 });
  const base = r.scenarios.find((s) => s.change === 0), up = r.scenarios.find((s) => s.change === 0.1);
  assert.ok(Math.abs(up.units / base.units - Math.pow(1.1, -1.5)) < 1e-6);
  assert.equal(r.scenarios.find((s) => s.change === -0.2).tested, false);
  assert.equal(base.tested, true);
});

test("parser: header, money formats, dates, merging, zero units, bad rows", () => {
  const p = parseRows("Date,Price,Units\n2025-01-06,$24.00,10\n1/13/2025,\"$25.50\",8\n2025-01-13,25.50,4\n2025-01-20,26,0\nnope,1,1\n2025-01-27,-3,5");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].units, 12);
  assert.equal(p.rows[1].price, 25.5);
  assert.ok(p.warnings.some((w) => /zero units/.test(w)));
  assert.ok(p.warnings.some((w) => /skipped/.test(w)));
  assert.ok(p.warnings.some((w) => /shared a date/.test(w)));
});

test("parser: two columns means price,units in time order; empty input errors", () => {
  const p = parseRows("price,units\n10,100\n11,90");
  assert.equal(p.dated, false);
  assert.deepEqual(p.rows.map((r) => r.price), [10, 11]);
  assert.match(parseRows("").error, /Paste or upload/);
  assert.match(parseRows("5\n6").error, /at least price and units/);
  assert.ok(Number.isNaN(parseDate("banana")));
});

test("csv export has a row per scenario", () => {
  const r = analyze(series(-1.5), { trend: false, season: false, cost: 10 });
  assert.equal(reportCsv(r).split("\n").length, r.scenarios.length + 1);
>>>>>>> origin/main
});
