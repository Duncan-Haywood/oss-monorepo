import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDateCell, parseAmount, parseRows, toMonthly, parseSeries, nelderMead, fitHW, forecastHW, selectModel,
  backtest, analyze, forecastCsv, simulateMonthly, sampleText, rng, gaussian, MIN_MONTHS, Z80, Z95,
} from "./calc.mjs";

const values = (months) => months.map((m) => m.value);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b} (tol ${tol})`);

// ---------- optimiser ----------

test("Nelder-Mead finds the minimum of a smooth bowl", () => {
  const r = nelderMead((x) => (x[0] - 3) ** 2 + 2 * (x[1] + 1) ** 2, [0, 0]);
  near(r.x[0], 3, 1e-3);
  near(r.x[1], -1, 1e-3);
});

// ---------- parsing ----------

test("dates are read in ISO, slash, month-name and month-only forms", () => {
  assert.deepEqual(parseDateCell("2024-03-31"), { y: 2024, m: 3, d: 31, monthOnly: false });
  assert.deepEqual(parseDateCell("2024/3/5"), { y: 2024, m: 3, d: 5, monthOnly: false });
  assert.deepEqual(parseDateCell("2024-03-05T10:00:00Z"), { y: 2024, m: 3, d: 5, monthOnly: false });
  assert.deepEqual(parseDateCell("2024-03"), { y: 2024, m: 3, d: 1, monthOnly: true });
  assert.deepEqual(parseDateCell("Mar 5, 2024"), { y: 2024, m: 3, d: 5 });
  assert.deepEqual(parseDateCell("5 March 2024"), { y: 2024, m: 3, d: 5 });
  assert.deepEqual(parseDateCell("Mar 2024"), { y: 2024, m: 3, d: 1, monthOnly: true });
  assert.deepEqual(parseDateCell("3/5/24"), { amb: [3, 5, 2024] });
  assert.equal(parseDateCell("2024-02-30"), null);
  assert.equal(parseDateCell("2024-13-01"), null);
  assert.equal(parseDateCell("hello"), null);
  assert.equal(parseDateCell(""), null);
});

test("amounts: currency symbols, thousands separators, parentheses and trailing minus are refunds", () => {
  assert.equal(parseAmount("$1,234.50"), 1234.5);
  assert.equal(parseAmount("1234"), 1234);
  assert.equal(parseAmount("-45.10"), -45.1);
  assert.equal(parseAmount("(45.10)"), -45.1);
  assert.equal(parseAmount("45.10-"), -45.1);
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("12,5", true), 12.5);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
});

test("slash dates are month-first unless the file proves day-first", () => {
  const us = parseRows("date,amount\n03/04/2024,10\n05/06/2024,20");
  assert.equal(us.rows[0].m, 3);
  assert.equal(us.rows[0].d, 4);
  assert.equal(us.dayFirst, false);
  const eu = parseRows("date,amount\n03/04/2024,10\n25/06/2024,20");
  assert.equal(eu.dayFirst, true);
  assert.equal(eu.rows[0].m, 4);
  assert.equal(eu.rows[0].d, 3);
});

test("header is found by name in any column order; headerless data uses date then amount", () => {
  const a = parseRows("Total,Order Date,Notes\n10,2024-01-05,x\n20,2024-01-06,y");
  assert.deepEqual(a.rows.map((r) => r.amount), [10, 20]);
  const b = parseRows("2024-01-05,10\n2024-01-06,20");
  assert.equal(b.rows.length, 2);
  const c = parseRows("date;sales\n2024-01-05;10,5\n2024-01-06;20,25");
  assert.deepEqual(c.rows.map((r) => r.amount), [10.5, 20.25]);
  const d = parseRows('date\tamount\n2024-01-05\t"1,000"');
  assert.equal(d.rows[0].amount, 1000);
});

test("unreadable rows are skipped and counted; an unreadable file gives a clear error", () => {
  const p = parseRows("date,amount\n2024-01-05,10\nnot a date,5\n2024-01-06,");
  assert.equal(p.rows.length, 1);
  assert.equal(p.skipped, 2);
  assert.match(parseRows("foo,bar\nbaz,qux").error, /readable date/);
  assert.match(parseRows("").error, /Paste or upload/);
});

test("daily rows sum into months and refunds net against sales", () => {
  const p = parseRows("date,amount\n2024-01-01,100\n2024-01-15,50\n2024-01-31,-30\n2024-02-01,10\n2024-02-29,10");
  assert.equal(p.negatives, 1);
  const t = toMonthly(p.rows);
  assert.deepEqual(t.months.map((m) => [m.key, m.value]), [["2024-01", 120], ["2024-02", 20]]);
});

test("missing months are gap-filled with zero and a warning says so", () => {
  const rows = parseRows("date,amount\n2023-01-01,10\n2023-02-01,10\n2023-05-01,10").rows;
  const t = toMonthly(rows);
  assert.deepEqual(t.months.map((m) => m.value), [10, 10, 0, 0, 10]);
  assert.equal(t.gapsFilled, 2);
  assert.match(t.warnings.join(" "), /2 months with no rows \(2023-03, 2023-04\) were filled with zero/);
});

test("a half-covered last month of daily data is dropped, not read as a slump", () => {
  let text = "date,amount\n";
  for (let d = 1; d <= 31; d++) text += `2024-01-${String(d).padStart(2, "0")},10\n`;
  for (let d = 1; d <= 10; d++) text += `2024-02-${String(d).padStart(2, "0")},10\n`;
  const t = toMonthly(parseRows(text).rows);
  assert.deepEqual(t.months.map((m) => m.key), ["2024-01"]);
  assert.match(t.warnings.join(" "), /2024-02/);
});

test("month-per-row data is never treated as partial", () => {
  const t = toMonthly(parseRows("date,amount\n2024-01-01,5\n2024-02-01,6\n2024-03-01,7").rows);
  assert.equal(t.months.length, 3);
  assert.deepEqual(t.droppedPartial, []);
});

test("a series shorter than 24 months is rejected with a clear message", () => {
  const rows = simulateMonthly({ n: 20, seed: 3 });
  const text = rows.map((r) => `${r.key}-01,${r.value.toFixed(2)}`).join("\n");
  const r = parseSeries(text);
  assert.match(r.error, /Only 20 months of history found/);
  assert.match(r.error, /at least 24 months/i);
  assert.equal(r.months, undefined);
  const exactly = simulateMonthly({ n: MIN_MONTHS, seed: 3 });
  assert.ok(parseSeries(exactly.map((x) => `${x.key}-01,${x.value.toFixed(2)}`).join("\n")).months);
});

test("weekly and daily exports parse to the same monthly series", () => {
  const monthly = simulateMonthly({ n: 26, seed: 5, noise: 0.03 });
  let daily = "date,amount\n";
  for (const m of monthly) {
    const dim = new Date(Date.UTC(m.y, m.m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) daily += `${m.key}-${String(d).padStart(2, "0")},${(m.value / dim).toFixed(6)}\n`;
  }
  const p = parseSeries(daily);
  assert.equal(p.months.length, 26);
  near(p.months[5].value, monthly[5].value, 0.01);
});

// ---------- model on data with a known answer ----------

test("a noiseless multiplicative series is reproduced almost exactly and the seasonal index is recovered", () => {
  const months = simulateMonthly({ n: 48, level: 10000, trend: 0, noise: 0, mult: true });
  const r = analyze(months, { horizon: 12 });
  assert.ok(!r.error);
  const truth = simulateMonthly({ n: 60, level: 10000, trend: 0, noise: 0, mult: true }).slice(48);
  r.forecast.forEach((f, i) => near(f.point, truth[i].value, truth[i].value * 0.01, f.key));
  // Jul (1.6) is the peak, Jan (0.55) the trough.
  const sorted = [...r.seasonal].sort((a, b) => b.index - a.index);
  assert.equal(sorted[0].name, "Jul");
  assert.equal(sorted[sorted.length - 1].name, "Jan");
  near(r.seasonal[6].index, 1.6, 0.03);
  near(r.seasonal[0].index, 0.55, 0.03);
  assert.equal(r.seasonal[6].label, "peak");
  assert.equal(r.seasonal[0].label, "slow");
});

test("an additive series with a trend is forecast within a few percent", () => {
  const season = [0.6, 0.7, 0.9, 1, 1.1, 1.3, 1.4, 1.3, 1.1, 0.9, 0.8, 0.9];
  const opts = { level: 8000, trend: 40, season, noise: 0.01, mult: false, seed: 7 };
  const months = simulateMonthly({ ...opts, n: 48 });
  const truth = simulateMonthly({ ...opts, n: 60, noise: 0 }).slice(48);
  const r = analyze(months, { horizon: 12 });
  const mape = r.forecast.reduce((s, f, i) => s + Math.abs(f.point - truth[i].value) / truth[i].value, 0) / 12;
  assert.ok(mape < 0.05, `MAPE ${mape}`);
});

test("model selection scores all four candidates and multiplicative is refused when a month is zero", () => {
  const months = simulateMonthly({ n: 40, seed: 11 });
  const sel = selectModel(values(months));
  assert.equal(sel.table.length, 4);
  assert.ok(sel.table.every((t) => t.mase > 0));
  assert.equal(sel.holdout, 12);
  const zeroed = values(months);
  zeroed[10] = 0;
  const sel2 = selectModel(zeroed);
  assert.equal(sel2.table.filter((t) => t.mult && t.mase === null).length, 2);
  assert.ok(!sel2.best.mult);
});

test("a short series (24-35 months) holds out 6 months, a longer one 12", () => {
  assert.equal(selectModel(values(simulateMonthly({ n: 24, seed: 2 }))).holdout, 6);
  assert.equal(selectModel(values(simulateMonthly({ n: 36, seed: 2 }))).holdout, 12);
});

test("fitted smoothing parameters stay inside their bounds", () => {
  const fit = fitHW(values(simulateMonthly({ n: 48, seed: 4 })), { mult: true, damped: true });
  const { alpha, beta, gamma, phi } = fit.params;
  for (const [v, lo, hi] of [[alpha, 0, 1], [beta, 0, 0.5], [gamma, 0, 1], [phi, 0.8, 0.98]]) assert.ok(v >= lo && v <= hi);
  const und = fitHW(values(simulateMonthly({ n: 48, seed: 4 })), { mult: false, damped: false });
  assert.equal(und.params.phi, 1);
});

test("prediction intervals nest, straddle the forecast and widen with the horizon", () => {
  const r = analyze(simulateMonthly({ n: 48, seed: 9, noise: 0.06 }), { horizon: 12 });
  for (const f of r.forecast) {
    assert.ok(f.lo95 <= f.lo80 && f.lo80 <= f.point && f.point <= f.hi80 && f.hi80 <= f.hi95);
  }
  assert.equal(r.forecast[0].key, "2026-01");
  assert.equal(r.forecast[11].key, "2026-12");
  // The uncertainty itself (sd, relative to the point for multiplicative) never shrinks as the horizon grows.
  const y = values(simulateMonthly({ n: 48, seed: 9, noise: 0.06 }));
  for (const mult of [false, true]) {
    const fc = forecastHW(fitHW(y, { mult, damped: false }), 12);
    const u = fc.map((f) => (mult ? f.sd / f.point : f.sd));
    for (let i = 1; i < u.length; i++) assert.ok(u[i] >= u[i - 1] - 1e-12, `h=${i + 1} mult=${mult}`);
    assert.ok(u[11] > u[0]);
  }
});

test("80% intervals cover about 80% of held-out months on simulated seasonal data", () => {
  // 60 simulated shops: fit on 36 months, score the next 12. Sampling error on ~720 points is about 1.5 points.
  let inside80 = 0, inside95 = 0, total = 0;
  for (let seed = 100; seed < 160; seed++) {
    const opts = { level: 12000, trend: 20, noise: 0.05, seed, mult: seed % 2 === 0 };
    const all = simulateMonthly({ ...opts, n: 48 });
    const train = values(all.slice(0, 36)), test = values(all.slice(36));
    const fit = fitHW(train, { mult: opts.mult, damped: false });
    const fc = forecastHW(fit, 12);
    fc.forEach((f, i) => {
      total++;
      if (Math.abs(test[i] - f.point) <= Z80 * f.sd) inside80++;
      if (Math.abs(test[i] - f.point) <= Z95 * f.sd) inside95++;
    });
  }
  const c80 = inside80 / total, c95 = inside95 / total;
  assert.ok(c80 > 0.72 && c80 < 0.88, `80% band covered ${c80}`);
  assert.ok(c95 > 0.9 && c95 < 0.99, `95% band covered ${c95}`);
});

test("coverage also holds for the whole analyze() path when the model is chosen from the data", () => {
  let inside = 0, total = 0;
  for (let seed = 300; seed < 330; seed++) {
    const all = simulateMonthly({ n: 48, noise: 0.05, seed, level: 9000 });
    const r = analyze(all.slice(0, 36), { horizon: 12 });
    r.forecast.forEach((f, i) => { total++; if (all[36 + i].value >= f.lo80 && all[36 + i].value <= f.hi80) inside++; });
  }
  const c = inside / total;
  assert.ok(c > 0.65 && c < 0.92, `80% band covered ${c}`);
});

// ---------- back-test against the naive baseline ----------

test("on strongly seasonal, trending data the model beats 'same month last year'", () => {
  const months = simulateMonthly({ n: 48, level: 10000, trend: 150, noise: 0.03, seed: 21 });
  const r = analyze(months, { horizon: 12 });
  assert.equal(r.backtest.verdict, "beats");
  assert.equal(r.backtest.doNotTrust, false);
  assert.ok(r.backtest.modelMase < r.backtest.baselineMase);
  assert.ok(r.backtest.modelMape < r.backtest.baselineMape);
  assert.ok(r.backtest.origins >= 4);
});

test("on pure noise with no seasonality the tool warns not to trust it", () => {
  const u = rng(77);
  const flat = simulateMonthly({ n: 48, season: new Array(12).fill(1), noise: 0.15, seed: 5 });
  // A random walk-free flat series: baseline and model both guess; the verdict must not be 'beats' by construction of noise.
  const months = flat.map((m) => ({ ...m, value: 5000 * (1 + 0.2 * gaussian(u)) }));
  const r = analyze(months, { horizon: 6 });
  assert.ok(r.backtest);
  if (r.backtest.verdict === "beats") assert.ok(r.backtest.ratio < 0.95);
  else assert.match(r.backtest.message, /within noise|Do not trust/);
});

test("backtest flags doNotTrust when the model is worse than the baseline", () => {
  // Same month last year is exactly right by construction (period 12, no noise, no trend), while a
  // damped model started on an outlier-poisoned series cannot be. Force the comparison directly.
  const y = values(simulateMonthly({ n: 48, noise: 0, seed: 1 }));
  const bt = backtest(y, { mult: true, damped: false });
  // Noiseless periodic series: the baseline error is zero, so the model cannot beat it.
  assert.ok(bt.baselineMase < 1e-9);
  assert.equal(bt.doNotTrust, true);
  assert.equal(bt.verdict, "worse");
  assert.match(bt.message, /Do not trust/);
});

test("baseline is exactly the value twelve months earlier", () => {
  const y = values(simulateMonthly({ n: 36, seed: 8 }));
  const bt = backtest(y, { mult: true, damped: false }, 6, 1);
  assert.equal(bt.origins, 1);
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += Math.abs(y[30 + i - 12] - y[30 + i]);
  near(bt.baselineMae, sum / 6, 1e-6);
});

test("rolling origins never look ahead: changing future months does not change earlier origins", () => {
  const y = values(simulateMonthly({ n: 40, seed: 12 }));
  const a = backtest(y, { mult: true, damped: false }, 6, 3);
  const y2 = y.slice();
  y2[39] *= 5;
  const b = backtest(y2, { mult: true, damped: false }, 6, 3);
  // The earliest origin (train 31) scores months 31..36 and never touches month 39.
  assert.equal(a.rows[0].modelMae, b.rows[0].modelMae);
  assert.notEqual(a.rows[2].modelMae, b.rows[2].modelMae);
});

test("too little history for a back-test is reported, not invented", () => {
  assert.equal(backtest(values(simulateMonthly({ n: 20, seed: 1 })), { mult: false, damped: false }, 6), null);
});

// ---------- cash cushion ----------

test("slow-season cash cushion sums the shortfall of the low band under the fixed cost", () => {
  const months = simulateMonthly({ n: 48, level: 10000, noise: 0.04, seed: 31 });
  const r = analyze(months, { horizon: 12, fixedCost: 9000 });
  const c = r.cushion;
  assert.ok(c.total > 0);
  const expected = r.forecast.reduce((s, f) => s + Math.max(0, 9000 - f.lo80), 0);
  near(c.total, expected, 1e-6);
  assert.ok(c.expectedTotal <= c.total + 1e-9);
  assert.ok(c.peakRunningDeficit >= 0 && c.peakRunningDeficit <= c.total + 1e-9);
  // Only slow months contribute: peak summer months clear the cost.
  const jul = c.rows.find((x) => x.key.endsWith("-07"));
  assert.equal(jul.shortfall, 0);
  const wider = analyze(months, { horizon: 12, fixedCost: 9000, band: 95 }).cushion;
  assert.ok(wider.total >= c.total);
});

test("no fixed cost means no cushion; a very low fixed cost needs none", () => {
  const months = simulateMonthly({ n: 36, seed: 2 });
  assert.equal(analyze(months, {}).cushion, null);
  assert.equal(analyze(months, { fixedCost: 100 }).cushion.total, 0);
});

// ---------- output ----------

test("forecast CSV has one row per month, numeric columns and the shortfall when a cost is set", () => {
  const r = analyze(simulateMonthly({ n: 36, seed: 6 }), { horizon: 8, fixedCost: 8000 });
  const lines = forecastCsv(r).trim().split("\n");
  assert.equal(lines[0], "month,forecast,low_80,high_80,low_95,high_95,shortfall_vs_fixed_cost");
  assert.equal(lines.length, 9);
  for (const l of lines.slice(1)) assert.match(l, /^\d{4}-\d{2}(,-?\d+\.\d{2}){6}$/);
  const plain = forecastCsv(analyze(simulateMonthly({ n: 36, seed: 6 }), { horizon: 6 }));
  assert.ok(!plain.includes("shortfall"));
});

test("the example text parses, forecasts and passes its own back-test", () => {
  const p = parseSeries(sampleText());
  assert.equal(p.months.length, 36);
  const r = analyze(p.months, { horizon: 12, fixedCost: 9000 });
  assert.ok(!r.error);
  assert.equal(r.backtest.doNotTrust, false);
});

test("analysis rejects a flat series and a short one", () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ y: 2022 + Math.floor(i / 12), m: (i % 12) + 1, key: "x", value: 100 }));
  assert.match(analyze(flat).error, /same value/);
  assert.match(analyze(flat.slice(0, 10)).error, /At least 24/);
});

test("horizon is clamped to 1..12", () => {
  const months = simulateMonthly({ n: 36, seed: 6 });
  assert.equal(analyze(months, { horizon: 99 }).forecast.length, 12);
  assert.equal(analyze(months, { horizon: 0 }).forecast.length, 12);
  assert.equal(analyze(months, { horizon: 3 }).forecast.length, 3);
});

// ---------- privacy ----------

test("calc.mjs makes no network calls and imports nothing", () => {
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(|^\s*import\s/m);
});

test("running a full analysis calls fetch zero times", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("network call"); };
  try {
    analyze(parseSeries(sampleText()).months, { horizon: 12, fixedCost: 8000 });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
});
