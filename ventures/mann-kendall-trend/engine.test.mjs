import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, yueWangFactor, mannKendall, seasonalKendall, senSlope, mkScore, varS, exactP, normSf, normPpf, chi2Sf, parseCsv, readSeries, parseDate, acf, rankAverage, report, toCsv, PAPERS } from "./engine.mjs";

const file = (p) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

const peaks = parseCsv(file("data/potomac-annual-peaks.csv")).rows.map((r) => Number(r[1]));
const monthlyRows = parseCsv(file("data/potomac-monthly-flow.csv")).rows.filter((r) => Number(r[0].slice(0, 4)) >= 1931 && Number(r[0].slice(0, 4)) <= 2025);
const flow = monthlyRows.map((r) => Number(r[1]));
const index = (x) => x.map((_, i) => i + 1);

// A seeded generator, so the property tests are repeatable.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());

test("special functions match scipy", () => {
  for (const [q, v] of REF.special.norm_sf) rel(normSf(q), v, 1e-12, `norm.sf(${q})`);
  for (const [p, v] of REF.special.norm_ppf) rel(normPpf(p), v, 1e-12, `norm.ppf(${p})`);
  for (const [x, d, v] of REF.special.chi2_sf) rel(chi2Sf(x, d), v, 1e-12, `chi2.sf(${x}, ${d})`);
});

for (const name of ["peaks", "monthly"]) {
  test(`${name}: S, variance, Z and p match pymannkendall ${REF.versions.pymannkendall} for every correction`, () => {
    const x = name === "peaks" ? peaks : flow;
    const t = index(x);
    assert.equal(x.length, REF[name].n);
    const sen = senSlope(t, x);
    rel(sen.slope, REF[name].original.slope, 1e-12, "Sen's slope");
    const mk = mannKendall(t, x, { slope: sen.slope });
    const map = { none: "original", "hamed-rao": "hamed_rao", "hamed-rao-3": "hamed_rao_3", "yue-wang": "yue_wang_ar1", tfpw: "tfpw" };
    for (const [ours, theirs] of Object.entries(map)) {
      const a = mk.tests[ours];
      const b = REF[name][theirs];
      assert.equal(a.s, b.s, `${ours} S`);
      rel(a.variance, b.var_s, 1e-9, `${ours} var S`);
      rel(a.z, b.z, 1e-9, `${ours} Z`);
      rel(a.p, b.p, 1e-9, `${ours} p`);
      if (b.trend) assert.equal(a.trend, b.trend, `${ours} verdict`);
    }
    // pymannkendall's default Yue-Wang (every lag summed) is reproduced by the helper
    const all = REF[name].yue_wang_all_lags;
    const resid = x.map((xi, i) => xi - sen.slope * t[i]);
    rel(mk.varianceNoCorrection * yueWangFactor(resid, "all"), all.var_s, 1e-9, "all-lag Yue-Wang var S");
  });
}

test("Sen's slope interval matches scipy.stats.theilslopes at 95% and 90%", () => {
  const t = index(peaks);
  const { v } = varS(t, peaks);
  const s95 = senSlope(t, peaks, { variance: v, confidence: 0.95 });
  rel(s95.slope, REF.peaks.theilslopes.slope, 1e-12, "slope");
  rel(s95.intercept, REF.peaks.theilslopes.intercept, 1e-12, "intercept");
  rel(s95.lower, REF.peaks.theilslopes.low, 1e-12, "low");
  rel(s95.upper, REF.peaks.theilslopes.high, 1e-12, "high");
  const s90 = senSlope(t, peaks, { variance: v, confidence: 0.9 });
  rel(s90.lower, REF.peaks.theilslopes90.low, 1e-12, "low 90");
  rel(s90.upper, REF.peaks.theilslopes90.high, 1e-12, "high 90");
});

test("exact p-values for small n match scipy.stats.kendalltau(method='exact')", () => {
  for (const key of ["exact15", "exact8"]) {
    const x = REF[key].values;
    const s = mkScore(index(x), x);
    rel(exactP(x.length, s), REF[key].p, 1e-12, key);
  }
  // and the analysis uses it as the headline when n <= 20 with no ties
  const r = analyze({ x: REF.exact15.values, correction: "none" });
  rel(r.test.p, REF.exact15.p, 1e-12, "headline exact p");
  assert.match(r.summary, /exact p-value/);
  // textbook value: n = 4, S = 6 (all pairs rising) has probability 1/24 each way
  rel(exactP(4, 6), 2 / 24, 1e-15, "n=4");
});

test("seasonal Kendall matches pymannkendall's seasonal_test and correlated_seasonal_test", () => {
  const t = monthlyRows.map((r) => Number(r[0].slice(0, 4)) + (Number(r[0].slice(5, 7)) - 1) / 12);
  const season = monthlyRows.map((r) => r[0].slice(5, 7));
  const cycle = monthlyRows.map((r) => Number(r[0].slice(0, 4)));
  const sk = seasonalKendall(t, flow, season, cycle, { covariance: "on" });
  const ind = REF.seasonal.independent;
  assert.equal(sk.s, ind.s);
  rel(sk.tests.independent.variance, ind.var_s, 1e-12, "independent var");
  rel(sk.tests.independent.z, ind.z, 1e-12, "independent Z");
  rel(sk.tests.independent.p, ind.p, 1e-9, "independent p");
  // pymannkendall's correlated test drops the continuity correction; the variance is the comparison
  rel(sk.tests.covariance.variance, REF.seasonal.covariance.var_s, 1e-12, "Hirsch-Slack var");
  const sen = senSlope(t, flow, { groups: sk.groups });
  rel(sen.slope, ind.slope, 1e-9, "seasonal Sen slope per year");
  rel(sk.homogeneity.chi2, REF.seasonal.homogeneity.chi2, 1e-9, "homogeneity chi2");
  rel(sk.homogeneity.p, REF.seasonal.homogeneity.p, 1e-9, "homogeneity p");
});

test("the Hirsch-Slack covariance with missing years equals the simulated covariance", () => {
  // two seasons that share a year effect; a fifth of the cells missing
  const r = rng(7);
  const years = 12;
  const reps = 3000;
  const S1 = [];
  const S2 = [];
  const pred = [];
  const miss = Array.from({ length: years }, () => [r() < 0.2, r() < 0.2]);
  for (let k = 0; k < reps; k++) {
    const t = [];
    const x = [];
    const season = [];
    const cycle = [];
    for (let y = 0; y < years; y++) {
      const common = gauss(r);
      for (let g = 0; g < 2; g++) {
        if (miss[y][g]) continue;
        t.push(y + g / 2);
        x.push(common + 0.8 * gauss(r));
        season.push(g);
        cycle.push(y);
      }
    }
    const sk = seasonalKendall(t, x, season, cycle, { covariance: "on" });
    S1.push(sk.per[0].s);
    S2.push(sk.per[1].s);
    pred.push(sk.tests.covariance.variance);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const tot = S1.map((v, i) => v + S2[i]);
  const empirical = mean(tot.map((v) => v * v)) - mean(tot) ** 2;
  rel(mean(pred), empirical, 0.08, "Var(S1 + S2)");
  // and the diagonal entry equals the Kendall variance for that season's count
  const n1 = miss.filter((m) => !m[0]).length;
  const indep = seasonalKendall([0, 1, 2, 3], [1, 3, 2, 4], ["a", "a", "a", "a"], [0, 1, 2, 3], { covariance: "on" });
  rel(indep.tests.covariance.variance, (4 * 3 * 13) / 18, 1e-12, "one season, complete");
  assert.ok(n1 > 6);
});

test("on trend-free AR(1) noise the default Yue-Wang test holds its size; the plain test and the all-lag sum do not", () => {
  const r = rng(11);
  const reps = 300;
  const count = { plain: 0, yw: 0, all: 0, white: 0 };
  for (let k = 0; k < reps; k++) {
    const x = [];
    const w = [];
    let e = 0;
    for (let i = 0; i < 100; i++) {
      const g = gauss(r);
      e = 0.6 * e + g;
      x.push(e);
      w.push(g);
    }
    const res = analyze({ x });
    if (res.tests.none.p < 0.05) count.plain++;
    if (res.tests["yue-wang"].p < 0.05) count.yw++;
    // white noise through the all-lag factor
    const t = index(w);
    const sen = senSlope(t, w).slope;
    const f = yueWangFactor(w.map((v, i) => v - sen * t[i]), "all");
    const { v } = varS(t, w);
    const s = mkScore(t, w);
    if (!(f > 0) || 2 * normSf(Math.abs((Math.abs(s) - 1) / Math.sqrt(v * f))) < 0.05) count.all++;
  }
  assert.ok(count.plain / reps > 0.2, `plain rejection rate ${count.plain / reps}`);
  assert.ok(count.yw / reps < 0.12, `Yue-Wang AR(1) rejection rate ${count.yw / reps}`);
  assert.ok(count.all / reps > 0.25, `all-lag rejection rate on white noise ${count.all / reps}`);
});

test("finds a planted trend with its slope, in any time unit and row order", () => {
  const r = rng(3);
  const t = [];
  const x = [];
  for (let i = 0; i < 60; i++) {
    const ti = 2000 + i * 0.5 + r() * 0.2;
    t.push(ti);
    x.push(10 + 0.4 * (ti - 2000) + gauss(r));
  }
  const a = analyze({ t, x, correction: "none" });
  assert.equal(a.test.trend, "increasing");
  assert.ok(a.sen.lower < 0.4 && 0.4 < a.sen.upper, `${a.sen.lower} .. ${a.sen.upper}`);
  // shuffling rows, shifting time and scaling values change nothing but the slope's scale
  const order = t.map((_, i) => i).sort(() => r() - 0.5);
  const b = analyze({ t: order.map((i) => (t[i] - 2000) * 12), x: order.map((i) => 3 * x[i] + 7), correction: "none" });
  assert.equal(b.s, a.s);
  rel(b.test.p, a.test.p, 1e-12, "p unchanged");
  rel(b.sen.slope, (3 * a.sen.slope) / 12, 1e-12, "slope rescaled");
  // a decreasing copy is the mirror image
  const c = analyze({ t, x: x.map((v) => -v), correction: "none" });
  assert.equal(c.s, -a.s);
  assert.equal(c.test.trend, "decreasing");
});

test("ties in values and times use Kendall's full variance", () => {
  // brute force: the variance of S over all 7! orderings of a tied sample
  const t = [1, 1, 2, 3, 3, 3, 4];
  const x0 = [5, 5, 6, 6, 7, 8, 8];
  const perms = [];
  const permute = (a, k = 0) => {
    if (k === a.length) return perms.push(a.slice());
    for (let i = k; i < a.length; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      permute(a, k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  permute(x0.slice());
  let m2 = 0;
  for (const p of perms) m2 += mkScore(t, p) ** 2;
  rel(varS(t, x0).v, m2 / perms.length, 1e-12, "Var S with ties in both");
});

test("monthly dates pick the seasonal test, with slopes per year", () => {
  const r = analyze({ csv: file("data/potomac-monthly-flow.csv") });
  assert.equal(r.mode, "seasonal");
  assert.equal(r.seasonMode, "month");
  assert.equal(r.seasonal.per.length, 12);
  assert.equal(r.test.key, "covariance");
  assert.equal(r.unit, "year");
  assert.equal(r.n, 1159);
  assert.ok(r.test.factor > 2, "monthly flows are correlated across months");
  const none = analyze({ csv: file("data/potomac-monthly-flow.csv"), seasons: "none" });
  assert.equal(none.mode, "single");
  const q = analyze({ csv: file("data/potomac-monthly-flow.csv"), seasons: "quarter" });
  assert.equal(q.seasonal.per.length, 4);
  assert.match(q.warnings.join(" "), /More than one value|independent/i);
});

test("the adjusted record: the covariance correction changes the verdict", () => {
  const r = analyze({ csv: file("data/potomac-adjusted-monthly-flow.csv") });
  assert.equal(r.tests.independent.trend, "increasing");
  assert.equal(r.tests.covariance.trend, "no trend");
  assert.match(r.summary, /opposite verdict/);
});

test("input handling: dates, censored values, arrays, errors", () => {
  assert.deepEqual(parseDate("2024-03"), { year: 2024, month: 3, days: parseDate("2024-03-01").days, decimalYear: 2024 + 2 / 12 });
  assert.equal(parseDate("2023-02-29"), null);
  rel(parseDate("2024-01-01T12:00-06:00").decimalYear, 2024 + 0.75 / 31 / 12, 1e-12, "zone");
  const s = readSeries(parseCsv("date,conc\n2020-01-05,3\n2020-04-02,<1\n2020-07-01,4\n2020-10-03,5\n2021-01-07,4.5\n"));
  assert.equal(s.rows.length, 4);
  assert.equal(s.censored, 1);
  const r = analyze({ csv: "date,conc\n2020-01-05,3\n2020-04-02,<1\n2020-07-01,4\n2020-10-03,5\n2021-01-07,4.5\n2021-04-02,6\n" });
  assert.match(r.warnings.join(" "), /detection limit/);
  assert.throws(() => analyze({ x: [1, 2, 3] }), /at least 4/);
  assert.throws(() => analyze({ x: [1, 2, 3, 4], correction: "magic" }), /Unknown correction/);
  assert.throws(() => analyze({ t: [1, 1, 1, 1], x: [1, 2, 3, 4] }), /same time/);
  assert.throws(() => analyze({ csv: "a,b\n1,2\n2,3\n3,4\n4,5\n", seasons: "month" }), /need a date column/);
  const col = analyze({ csv: "year,season,v\n2001,wet,3\n2001,dry,1\n2002,wet,4\n2002,dry,2\n2003,wet,5\n2003,dry,1.5\n", seasonColumn: "season" });
  assert.equal(col.mode, "seasonal");
  assert.deepEqual(col.seasonal.per.map((p) => p.season), ["wet", "dry"]);
});

test("helpers: ranks and autocorrelation", () => {
  assert.deepEqual([...rankAverage([3, 1, 3, 2])], [3.5, 1, 3.5, 2]);
  const a = acf([1, 2, 3, 4, 5], 2);
  rel(a[0], 1, 1e-15, "lag 0");
  rel(a[1], 0.4, 1e-12, "lag 1"); // (-2*-1 + -1*0 + 0*1 + 1*2) / 10
});

test("report, CSV and citations", () => {
  const r = analyze({ csv: file("data/potomac-annual-peaks.csv") });
  assert.match(report(r), /Hamed-Rao corrected/);
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv[0], "time,value,sen_line,residual");
  assert.equal(csv.length, r.n + 1);
  assert.ok(PAPERS.length >= 8);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
});

test("Yue-Wang default holds its size on short white noise (quality audit 2026-11-17)", () => {
  // Before the factor was floored at 1, 10.6-11.1% of n = 8-10 trend-free
  // series were called trends at the 5% level.
  let t = 20261117;
  const r = () => {
    t = (t + 0x6d2b79f5) | 0;
    let u = Math.imul(t ^ (t >>> 15), t | 1);
    u ^= u + Math.imul(u ^ (u >>> 7), u | 61);
    return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
  };
  const g = () => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
  for (const n of [8, 10]) {
    let rej = 0;
    const N = 2000;
    for (let k = 0; k < N; k++) if (analyze({ x: Array.from({ length: n }, g) }).tests["yue-wang"].p < 0.05) rej++;
    assert.ok(rej / N < 0.07, `n=${n}: ${rej / N}`);
  }
  assert.equal(yueWangFactor([1, -1, 1, -1, 1, -1]), 1);
});
