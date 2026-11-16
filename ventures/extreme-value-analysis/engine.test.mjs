import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, fitGev, fitGumbel, fitGpd, gevNll, gpdNll, gevQuantileUpper, gevCdf, gpdCdf, gpdQuantile, potReturnLevel,
  decluster, quantile, parseNumberList, normQuantile, normCdf, chi2Sf1, chi2Q1, gamma, sampleLMoments, riskOverLife, periodForRisk, readSeries, parseCsv, sampleInput,
} from "./engine.mjs";

const file = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const close = (a, b, tol, what) => assert.ok(rel(a, b) <= tol, `${what}: ${a} vs ${b} (rel ${rel(a, b)})`);
const annual = () => file("data/potomac-annual-peaks.csv").trim().split("\n").slice(1).map((l) => Number(l.split(",")[2]));

test("numeric helpers match known values", () => {
  close(normQuantile(0.975), 1.959963984540054, 1e-7, "z 0.975"); // erfc is good to ~1e-7
  close(normQuantile(1e-6), -4.753424308822899, 1e-7, "z 1e-6");
  close(normCdf(1.959963984540054), 0.975, 1e-7, "Phi");
  close(chi2Q1(0.95), 3.841458820694124, 1e-7, "chi2 0.95");
  close(chi2Sf1(3.841458820694124), 0.05, 1e-6, "chi2 sf");
  close(gamma(5), 24, 1e-12, "gamma 5");
  close(gamma(0.5), Math.sqrt(Math.PI), 1e-12, "gamma 0.5");
  close(gamma(1.2), 0.9181687423997607, 1e-12, "gamma 1.2");
  const lm = sampleLMoments([1, 2, 3, 4, 10]);
  close(lm.l1, 4, 1e-12, "l1");
  close(lm.l2, 2, 1e-12, "l2"); // half the mean absolute difference over the 10 pairs: 40 / 10 / 2
});

test("distribution functions agree with each other and with the Gumbel limit", () => {
  for (const xi of [-0.3, 0, 0.2]) {
    const q = gevQuantileUpper(0.01, 5, 2, xi);
    close(1 - gevCdf(q, 5, 2, xi), 0.01, 1e-10, `GEV ${xi}`);
    const g = gpdQuantile(0.9, 3, xi);
    close(gpdCdf(g, 3, xi), 0.9, 1e-10, `GPD ${xi}`);
  }
  close(gevNll([1, 2, 3], 1.5, 1, 1e-9), gevNll([1, 2, 3], 1.5, 1, 0), 1e-7, "GEV nll at the Gumbel limit");
  close(gpdNll([1, 2, 3], 2, 1e-9), gpdNll([1, 2, 3], 2, 0), 1e-7, "GPD nll at the exponential limit");
  assert.equal(gevNll([10], 0, 1, -0.5), Infinity); // 10 is above the end point mu + sigma / 0.5 = 2
  close(potReturnLevel(10, 100, 20, 0, 3), 100 + 20 * Math.log(30), 1e-12, "POT exponential");
});

test("GEV and Gumbel fits match scipy on the Potomac annual peaks", () => {
  const ref = REF.cases.potomac_annual;
  const x = annual();
  assert.equal(x.length, ref.n);
  const g = fitGev(x);
  close(g.mu, ref.gev.mu, 1e-6, "mu");
  close(g.sigma, ref.gev.sigma, 1e-6, "sigma");
  close(g.xi, ref.gev.xi, 1e-5, "xi");
  assert.ok(g.nll <= ref.gev.nll + 1e-7, `nll ${g.nll} vs scipy ${ref.gev.nll}`);
  for (const [T, lvl] of Object.entries(ref.gev.levels)) close(gevQuantileUpper(1 / Number(T), g.mu, g.sigma, g.xi), lvl, 1e-6, `${T}-year`);
  const gu = fitGumbel(x);
  close(gu.mu, ref.gumbel.mu, 1e-5, "Gumbel mu");
  close(gu.sigma, ref.gumbel.sigma, 1e-5, "Gumbel sigma");
  assert.ok(gu.nll <= ref.gumbel.nll + 1e-7);
});

test("GEV fits match scipy on simulated heavy, bounded and Gumbel-like samples", () => {
  for (const name of ["synthetic_heavy", "synthetic_bounded", "synthetic_gumbel"]) {
    const c = REF.cases[name];
    const g = fitGev(c.x);
    assert.ok(g.nll <= c.gev.nll + 1e-7, `${name}: nll ${g.nll} vs ${c.gev.nll}`);
    close(g.xi + 1, c.gev.xi + 1, 1e-5, `${name} xi`);
    close(g.sigma, c.gev.sigma, 1e-5, `${name} sigma`);
    close(g.mu, c.gev.mu, 1e-5, `${name} mu`);
  }
});

test("GPD fits match scipy (floc = 0)", () => {
  for (const name of ["synthetic_gpd_heavy", "synthetic_gpd_bounded"]) {
    const c = REF.cases[name];
    const f = fitGpd(c.y);
    assert.ok(f.nll <= c.gpd.nll + 1e-7, `${name} nll`);
    close(f.sigma, c.gpd.sigma, 1e-5, `${name} sigma`);
    close(f.xi + 1, c.gpd.xi + 1, 1e-5, `${name} xi`);
  }
});

test("the daily series: water-year maxima, threshold, runs declustering and GPD match the reference", () => {
  const ref = REF.cases.potomac_daily;
  const r = analyze({ csv: file("data/potomac-daily-flow.csv"), yearStart: 10, runLength: 7, profile: false });
  assert.deepEqual(r.annualMaxima.map((a) => a.value), ref.waterYearMaxima);
  assert.deepEqual(r.annualMaxima.map((a) => a.year), Array.from({ length: 20 }, (_, i) => 2007 + i));
  close(r.block.gev.xi + 1, ref.gev.xi + 1, 1e-5, "daily GEV xi");
  close(r.pot.threshold, ref.threshold, 1e-12, "threshold");
  assert.equal(r.pot.nClusters, ref.clusters);
  close(r.pot.gpd.sigma, ref.gpd.sigma, 1e-5, "GPD sigma");
  close(r.pot.gpd.xi + 1, ref.gpd.xi + 1, 1e-5, "GPD xi");
  close(r.pot.nYears, 20, 1e-3, "years");
});

test("profile intervals bracket the estimate, widen to the right, and contain the delta centre", () => {
  const r = analyze({ csv: file("data/potomac-annual-peaks.csv"), returnPeriods: [10, 100], trend: false });
  for (const row of r.block.returnLevels) {
    assert.ok(row.profile.lower < row.level && row.level < row.profile.upper, `T=${row.T}`);
    // Heavy tail: the profile interval is skewed upward compared with the symmetric delta one.
    assert.ok(row.profile.upper - row.level > row.level - row.profile.lower, `skew T=${row.T}`);
  }
  // At the bounds the profile deviance equals the chi-square quantile (checked by refitting).
  const x = annual();
  const fit = fitGev(x);
  const t100 = r.block.returnLevels[1];
  const y = -Math.log1p(-0.01);
  let best = Infinity;
  for (let xi = -0.2; xi <= 0.6; xi += 0.002) for (let ls = Math.log(fit.sigma) - 0.4; ls <= Math.log(fit.sigma) + 0.4; ls += 0.004) {
    const s = Math.exp(ls);
    best = Math.min(best, gevNll(x, t100.profile.upper + (s / xi) * (1 - Math.pow(y, -xi)), s, xi));
  }
  assert.ok(Math.abs(2 * (best - fit.nll) - chi2Q1(0.95)) < 0.02, `deviance at the upper bound ${2 * (best - fit.nll)}`);
  assert.ok(r.block.gev.xiProfile.lower > 0, "heavy tail: shape interval above zero");
  assert.ok(r.block.gumbelVsGev.p < 0.05);
});

test("summary states the 100-year level, the tail and the Gumbel test in words", () => {
  const r = analyze({ csv: file("data/potomac-annual-peaks.csv") });
  assert.match(r.summary[0], /96 years/);
  assert.match(r.summary[1], /100-year level \(a 1% chance of being exceeded in any one year\) is 411,617/);
  assert.match(r.summary.join(" "), /reject the Gumbel/);
  assert.ok(r.block.trend.lrt.p > 0.5, "no trend in the location over 1931-2026");
  assert.ok(r.block.returnLevels.find((x) => x.T === 500).extrapolated);
  assert.ok(!r.block.returnLevels.find((x) => x.T === 100).extrapolated);
});

test("runs declustering", () => {
  const v = [0, 5, 6, 0, 7, 0, 0, 0, 9, 0, 0, 0, 0, 8];
  const r1 = decluster(v, 4, 1);
  assert.deepEqual(r1.clusters.map((c) => c.peak), [6, 7, 9, 8]);
  const r3 = decluster(v, 4, 3);
  assert.deepEqual(r3.clusters.map((c) => c.peak), [7, 9, 8]);
  assert.equal(r3.nExceed, 5);
  close(r3.extremalIndex, 3 / 5, 1e-12, "theta");
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test("design-life risk", () => {
  close(riskOverLife(100, 50), 1 - 0.99 ** 50, 1e-12, "risk");
  close(periodForRisk(riskOverLife(100, 50), 50), 100, 1e-9, "inverse");
  close(periodForRisk(0.1, 50), 475.06, 1e-4, "the 475-year rule");
});

test("input handling: columns, US dates, headerless numbers, errors", () => {
  const s = readSeries("Date,Stage ft\n1/2/2020,3.1\n1/3/2020,\n1/4/2020,4");
  assert.equal(s.dateColumn, "Date");
  assert.equal(s.valueColumn, "Stage ft");
  assert.equal(s.obs.length, 2);
  assert.equal(s.dropped, 1);
  assert.deepEqual(parseCsv('a,"b, c"\n1,2'), [["a", "b, c"], ["1", "2"]]);
  const plain = analyze({ csv: "12\n15\n11\n19\n14\n13\n22\n16\n12\n18\n25\n14", profile: false });
  assert.match(plain.warnings.join(" "), /each row is taken as one year's maximum/);
  assert.equal(plain.block.nYears, 12);
  assert.match(plain.warnings.join(" "), /Only 12 annual maxima/);
  assert.throws(() => analyze({ csv: "year,v\n2001,3\n2002,4", method: "pot" }), /already a set of annual maxima/);
  assert.throws(() => analyze({ csv: "x\na\nb" }), /no numeric column|no numbers/);
  assert.throws(() => analyze({ csv: file("data/potomac-annual-peaks.csv"), value: "nope" }), /no column named "nope"/);
  assert.throws(() => analyze({ csv: "1\n2", confidence: 2 }), /confidence/);
  assert.ok(analyze(sampleInput()).block.returnLevels.length === 8);
});

test("incomplete years are left out of the annual maxima and named", () => {
  const rows = ["date,v"];
  for (let y = 2000; y < 2010; y++) for (let d = 0; d < (y === 2009 ? 40 : 365); d++) {
    const dt = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10);
    rows.push(`${dt},${((y * 7919 + d * 104729) % 1000) / 10}`);
  }
  const r = analyze({ csv: rows.join("\n"), profile: false, trend: false, method: "gev" });
  assert.equal(r.block.nYears, 9);
  assert.match(r.warnings.join(" "), /incomplete year\(s\).*2009/);
});

test("return periods: a thousands comma is not a separator", () => {
  assert.deepEqual(parseNumberList("2, 10, 100, 1,000"), [2, 10, 100, 1000]);
  assert.deepEqual(parseNumberList("2,10,100"), [2, 10, 100]);
  assert.deepEqual(parseNumberList("5 50; 500"), [5, 50, 500]);
  assert.deepEqual(analyze({ ...sampleInput(), returnPeriods: "10, 1,000" }).block.returnLevels.map((r) => r.T), [10, 1000]);
});

test("an unquoted thousands comma is refused, a quoted one is read whole", () => {
  assert.throws(() => readSeries("year,peak\n2001,1,200\n2002,900"), /row 2 has 3 fields but the header has 2/);
  assert.deepEqual(readSeries('year,peak\n2001,"1,200"\n2002,900').obs.map((o) => o.value), [1200, 900]);
});

test("dates with an extra digit are not read as dates", () => {
  const good = "2025-03-10,5\n2025-03-11,5\n2025-03-12,5\n2025-03-13,5\n2025-03-14,5\n";
  assert.deepEqual(readSeries(`when,v\n${good}2025-03-091,4`).obs.map((o) => Boolean(o.date)), [true, true, true, true, true, false]);
  assert.equal(readSeries("when,v\n1/5/2026,4\n1/6/20261,5\n1/7/2026,5\n1/8/2026,5\n1/9/2026,5").obs[1].date, undefined);
});

test("a long series (200,000 rows) does not overflow the stack", () => {
  const rows = ["date,v"];
  for (let i = 0; i < 200000; i++) rows.push(`${new Date(Date.UTC(1500, 0, 1 + i)).toISOString().slice(0, 10)},${(i * 7919) % 10007}`);
  const r = analyze({ csv: rows.join("\n"), method: "pot", profile: false, trend: false, returnPeriods: [100] });
  assert.ok(r.pot.nYears > 547 && r.pot.nYears < 548);
});
