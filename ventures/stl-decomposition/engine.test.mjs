import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stl, analyze, parseDate, inferPeriod, defaultTrend, defaultLowPass, strengths, PAPERS, DEFAULTS } from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const KEYS = { period: "period", seasonal: "seasonal", trend: "trend", low_pass: "lowPass", seasonal_deg: "seasonalDeg", trend_deg: "trendDeg", low_pass_deg: "lowPassDeg", seasonal_jump: "seasonalJump", trend_jump: "trendJump", low_pass_jump: "lowPassJump", robust: "robust" };
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const CO2 = readFileSync(new URL("./data/mauna-loa-co2-monthly.csv", import.meta.url), "utf8");

test("matches statsmodels STL on every reference case", () => {
  assert.equal(ref.statsmodels, "0.15.0");
  assert.equal(ref.cases.length, 9);
  for (const c of ref.cases) {
    const opts = {};
    for (const [k, v] of Object.entries(c.settings)) opts[KEYS[k]] = v;
    const r = stl(c.y, opts);
    for (const k of ["trend", "seasonal", "resid", "weights"]) {
      const d = maxDiff(r[k], c[k]);
      assert.ok(d < 1e-9, `${c.name} ${k}: max difference ${d}`);
    }
  }
});

test("reference cases exercise robust, jumps, degree 0 and a window longer than the subseries", () => {
  const names = ref.cases.map((c) => c.name);
  for (const n of ["co2-robust", "co2-jumps-deg0", "short-window-exceeds-n", "hourly-24"]) assert.ok(names.includes(n), n);
  const robust = ref.cases.find((c) => c.name === "daily-outliers-robust");
  assert.ok(Math.min(...robust.weights) < 0.1, "planted outliers get low weight");
});

test("components add back up to the series", () => {
  const y = ref.cases[0].y;
  const r = stl(y, { period: 12, robust: true });
  for (let i = 0; i < y.length; i++) assert.ok(Math.abs(r.trend[i] + r.seasonal[i] + r.resid[i] - y[i]) < 1e-9);
});

test("adding a constant moves only the trend; scaling scales every component", () => {
  const y = ref.cases[4].y;
  const a = stl(y, { period: 7 });
  const b = stl(y.map((v) => v + 1000), { period: 7 });
  const c = stl(y.map((v) => v * -3), { period: 7 });
  assert.ok(maxDiff(b.trend, a.trend.map((v) => v + 1000)) < 1e-8);
  assert.ok(maxDiff(b.seasonal, a.seasonal) < 1e-8);
  assert.ok(maxDiff(c.seasonal, a.seasonal.map((v) => v * -3)) < 1e-8);
  assert.ok(maxDiff(c.trend, a.trend.map((v) => v * -3)) < 1e-8);
});

test("a pure repeating pattern on a line is recovered", () => {
  const pat = [5, -2, -4, 1];
  const y = Array.from({ length: 48 }, (_, i) => 10 + 0.5 * i + pat[i % 4]);
  const r = stl(y, { period: 4 });
  assert.ok(Math.max(...r.resid.map(Math.abs)) < 1e-6);
  for (let i = 0; i < 48; i++) assert.ok(Math.abs(r.seasonal[i] - pat[i % 4]) < 1e-6, `seasonal ${i}`);
});

test("defaults follow statsmodels", () => {
  assert.equal(defaultTrend(12, 7), 23);
  assert.equal(defaultTrend(7, 7), 15);
  assert.equal(defaultLowPass(12), 13);
  assert.equal(defaultLowPass(7), 9);
  assert.equal(DEFAULTS.seasonal, 7);
  const r = stl(ref.cases[0].y, { period: 12 });
  assert.equal(r.params.innerIter, 5);
  assert.equal(r.params.outerIter, 0);
  const rr = stl(ref.cases[0].y, { period: 12, robust: true });
  assert.equal(rr.params.innerIter, 2);
  assert.equal(rr.params.outerIter, 15);
});

test("invalid settings are refused with a reason", () => {
  const y = Array.from({ length: 40 }, (_, i) => i % 4);
  assert.throws(() => stl(y, { period: 1 }), /at least 2/);
  assert.throws(() => stl(y.slice(0, 7), { period: 4 }), /two full cycles/);
  assert.throws(() => stl(y, { period: 4, seasonal: 8 }), /odd/);
  assert.throws(() => stl(y, { period: 12, trend: 11 }), /longer than the period|two full cycles/);
  assert.throws(() => stl(y, { period: 4, trend: 3 }), /longer than the period/);
  assert.throws(() => stl([...y.slice(0, 39), NaN], { period: 4 }), /not a finite number/);
  assert.throws(() => stl(y, { period: 4, seasonalDeg: 2 }), /0 or 1/);
});

test("dates parse in the common shapes", () => {
  assert.equal(parseDate("2024-03"), Date.UTC(2024, 2, 1));
  assert.equal(parseDate("2024-03-05"), Date.UTC(2024, 2, 5));
  assert.equal(parseDate("2024-03-05T13:30"), Date.UTC(2024, 2, 5, 13, 30));
  assert.equal(parseDate("2024 Q3"), Date.UTC(2024, 6, 1));
  assert.equal(parseDate("3/5/2024"), Date.UTC(2024, 2, 5));
  assert.equal(parseDate("2024-W01"), Date.UTC(2024, 0, 1));
  assert.equal(parseDate("2024-13"), null);
  assert.equal(parseDate("hello"), null);
});

test("the period is inferred from the spacing of the dates", () => {
  const DAY = 86400000;
  const series = (step, n) => Array.from({ length: n }, (_, i) => i * step);
  assert.equal(inferPeriod(series(DAY, 30)).period, 7);
  assert.equal(inferPeriod(series(DAY / 24, 100)).period, 24);
  assert.equal(inferPeriod(series(7 * DAY, 120)).period, 52);
  assert.equal(inferPeriod(Array.from({ length: 30 }, (_, i) => Date.UTC(2020, i, 1))).period, 12);
  assert.equal(inferPeriod(Array.from({ length: 12 }, (_, i) => Date.UTC(2020, 3 * i, 1))).period, 4);
  assert.equal(inferPeriod(series(365 * DAY, 10)).period, null);
});

test("the CO2 example: monthly, strongly seasonal, peak in May, low in September or October", () => {
  const r = analyze({ csv: CO2 });
  assert.equal(r.error, undefined);
  assert.equal(r.column, "co2_ppm");
  assert.equal(r.dateColumn, "month");
  assert.equal(r.period, 12);
  assert.equal(r.n, 629);
  assert.match(r.periodSource, /monthly/);
  assert.ok(r.strength.seasonal > 0.95 && r.strength.trend > 0.99);
  assert.equal(r.peak.label, "May");
  assert.ok(["Sep", "Oct"].includes(r.trough.label));
  assert.ok(r.amplitude > 5 && r.amplitude < 8);
  assert.ok(r.trendChangeTotal > 90 && r.trendChangeTotal < 110);
  assert.match(r.summary, /very strong seasonality/);
  // Same numbers as statsmodels on the same series.
  assert.ok(maxDiff(r.trend, ref.cases[0].trend) < 1e-9);
});

test("STL's seasonally adjusted CO2 sits close to NOAA's own deseasonalized column", () => {
  const r = analyze({ csv: CO2, column: "co2_ppm" });
  const noaa = CO2.trim().split("\n").slice(1).map((l) => Number(l.split(",")[2]));
  const diffs = r.adjusted.map((v, i) => Math.abs(v - noaa[i]));
  const meanAbs = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  assert.ok(meanAbs < 0.1, `mean |difference| ${meanAbs} ppm`);
  assert.ok(Math.max(...diffs) < 0.5);
});

test("rows are sorted, interior gaps interpolated, edge gaps trimmed, duplicates refused", () => {
  const rows = [];
  for (let i = 0; i < 36; i++) rows.push([`20${String(20 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, "0")}`, 100 + (i % 12) * 3 + i]);
  const csv = (rs) => "month,sales\n" + rs.map((r) => r.join(",")).join("\n");
  const base = analyze({ csv: csv(rows) });
  const shuffled = analyze({ csv: csv([...rows].reverse()) });
  assert.ok(maxDiff(base.trend, shuffled.trend) < 1e-12);
  assert.ok(shuffled.warnings.some((w) => /sorted by date/.test(w)));
  const gappy = rows.map((r, i) => (i === 10 || i === 11 ? [r[0], ""] : r));
  gappy[0] = [gappy[0][0], "NA"];
  const g = analyze({ csv: csv(gappy) });
  assert.equal(g.n, 35);
  assert.deepEqual(g.filled, [9, 10]);
  assert.ok(Math.abs(g.observed[9] - (rows[9][1] + (rows[12][1] - rows[9][1]) / 3)) < 1e-9);
  assert.ok(g.warnings.some((w) => /interpolation/.test(w)));
  const dup = analyze({ csv: csv([...rows, rows[3]]) });
  assert.match(dup.error, /more than once/);
});

test("interpolated values lie on the straight line between neighbours", () => {
  const y = Array.from({ length: 24 }, (_, i) => 10 + (i % 4) * 2);
  const vals = y.map((v, i) => (i === 5 || i === 6 ? null : v));
  const r = analyze({ values: vals, period: 4 });
  assert.ok(Math.abs(r.observed[5] - (y[4] + (y[7] - y[4]) / 3)) < 1e-12);
  assert.ok(Math.abs(r.observed[6] - (y[4] + (2 * (y[7] - y[4])) / 3)) < 1e-12);
});

test("errors in plain words", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "1\n2\n3\n4\n5\n6\n7\n8" }).error, /period/);
  assert.match(analyze({ csv: "a,b\nx,y" }).error, /numeric/);
  assert.match(analyze({ csv: "1\n2\n3\n4\n5", period: 4 }).error, /two full cycles/);
  assert.match(analyze({ csv: "year,v\n2001,1\n2002,2\n2003,3\n2004,4" }).error, /period/);
  assert.match(analyze({ csv: CO2, column: "nope" }).error, /no column named/);
});

test("a planted spike is listed, and robust mode keeps it out of the seasonal pattern", () => {
  const y = Array.from({ length: 84 }, (_, i) => 100 + 0.2 * i + 10 * Math.sin((2 * Math.PI * i) / 7) + ((i * 37) % 11) / 10);
  y[40] += 60;
  const plain = analyze({ values: y, period: 7 });
  const robust = analyze({ values: y, period: 7, robust: true });
  assert.equal(plain.unusual[0].index, 40);
  assert.equal(robust.unusual[0].index, 40);
  assert.ok(robust.weights[40] < 0.05);
  // The spike leaks into the plain seasonal at its weekday; robust keeps it out.
  assert.ok(Math.abs(robust.resid[40]) > Math.abs(plain.resid[40]));
});

test("strengths are 0 when the remainder is everything and near 1 when it is nothing", () => {
  const z = [0, 0, 0, 0];
  assert.deepEqual(strengths(z, z, [1, -1, 1, -1]), { trend: 0, seasonal: 0 });
  const s = strengths([1, 2, 3, 4], [1, -1, 1, -1], [0, 1e-9, 0, -1e-9]);
  assert.ok(s.trend > 0.999 && s.seasonal > 0.999);
});

test("PAPERS cite STL, loess and the strength measures", () => {
  assert.equal(PAPERS.length, 3);
  assert.match(PAPERS[0].title, /STL/);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
});
