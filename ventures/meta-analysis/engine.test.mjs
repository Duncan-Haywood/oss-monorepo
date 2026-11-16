import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, readStudies, fitModel, estimateTau2, remlLogLik, eggerTest, binaryEffect, continuousEffect,
  parseCsv, toNumber, detectLayout, tCdf, tQuantile, chi2Quantile, chi2Sf, normQuantile, normCdf, betaInc,
  PAPERS, DEFAULTS, fmt, formatP, pEq,
} from "./engine.mjs";

const file = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const BCG = file("./data/bcg-vaccine-trials.csv");
const REF = JSON.parse(file("./eval/reference.json"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test("distribution functions match known values", () => {
  close(normQuantile(0.975), 1.959963984540054, 1e-12, "z 0.975");
  close(normCdf(-3), 0.0013498980316301, 1e-12, "Phi(-3)");
  close(tQuantile(0.975, 12), 2.178812829667228, 1e-10, "t 12");
  close(tQuantile(0.975, 2), 4.302652729911275, 1e-10, "t 2");
  close(tCdf(2, 5), 0.9490302605850709, 1e-10, "t cdf");
  close(chi2Quantile(0.975, 12), 23.33666415864534, 1e-9, "chi2 0.975, 12");
  close(chi2Quantile(0.025, 12), 4.403788506981854, 1e-9, "chi2 0.025, 12");
  close(chi2Sf(152.2330080823733, 12), 5.2e-26, 1, "chi2 tail tiny");
  assert.ok(chi2Sf(152.2330080823733, 12) < 1e-20);
  close(betaInc(0.3, 2, 5), 0.579825, 1e-6, "I_0.3(2,5)");
});

test("BCG effect sizes (log RR, log OR, RD) match the reference to 1e-12", () => {
  for (const m of ["RR", "OR", "RD"]) {
    const s = readStudies({ csv: BCG, measure: m });
    assert.equal(s.layout, "cells");
    assert.deepEqual(s.map, { ai: "tpos", bi: "tneg", ci: "cpos", di: "cneg" });
    assert.equal(s.studies.length, 13);
    s.studies.forEach((st, i) => {
      close(st.yi, REF[m].yi[i], 1e-12, `${m} yi ${i}`);
      close(st.vi, REF[m].vi[i], 1e-12, `${m} vi ${i}`);
    });
  }
  assert.equal(readStudies({ csv: BCG }).studies[0].label, "Aronson 1948");
});

test("DL and Paule-Mandel match statsmodels; REML matches a direct likelihood maximisation", () => {
  for (const m of ["RR", "OR", "RD"]) {
    for (const method of ["DL", "PM", "REML"]) {
      const r = analyze({ csv: BCG, measure: m, method, leaveOneOut: false });
      const ref = REF[m][method];
      // statsmodels' Paule-Mandel stops at its own tolerance (~1e-7); REML's reference is a bounded 1-D search.
      const tol = method === "DL" ? 1e-9 : 1e-6;
      close(r.tau2, ref.tau2, tol, `${m} ${method} tau2`);
      close(r.pooled.estimate, ref.estimate, tol, `${m} ${method} estimate`);
      close(r.pooled.se, ref.se, tol, `${m} ${method} se`);
      close(r.pooled.hk.lower, ref.hkLower, tol, `${m} ${method} HK lower`);
      close(r.pooled.hk.upper, ref.hkUpper, tol, `${m} ${method} HK upper`);
      if (ref.lower !== undefined) {
        close(r.pooled.lower, ref.lower, tol, `${m} ${method} lower`);
        close(r.pooled.upper, ref.upper, tol, `${m} ${method} upper`);
      }
    }
    const fe = analyze({ csv: BCG, measure: m, method: "FE", leaveOneOut: false });
    close(fe.pooled.estimate, REF[m].FE.estimate, 1e-10, `${m} FE`);
    close(fe.pooled.se, REF[m].FE.se, 1e-10, `${m} FE se`);
    close(fe.heterogeneity.Q, REF[m].Q, 1e-10, `${m} Q`);
    close(fe.heterogeneity.I2fromQ, REF[m].I2fromQ, 1e-10, `${m} I2`);
  }
});

test("REML's Fisher scoring lands on the likelihood maximum", () => {
  const s = readStudies({ csv: BCG });
  const y = s.studies.map((x) => x.yi), v = s.studies.map((x) => x.vi), X = y.map(() => [1]);
  const { tau2 } = estimateTau2(y, v, X, "REML");
  const ll = remlLogLik(y, v, X, tau2);
  for (const d of [-1e-3, 1e-3, -1e-2, 1e-2]) assert.ok(remlLogLik(y, v, X, tau2 + d) < ll, `ll at ${d}`);
});

test("heterogeneity: I-squared, Q-profile interval for tau-squared, prediction interval", () => {
  const r = analyze({ csv: BCG });
  close(r.heterogeneity.I2, REF.RR.REML.I2, 1e-6, "I2 (REML)");
  close(r.heterogeneity.tau2CI.lower, REF.RR.tau2CI[0], 1e-8, "tau2 CI lower");
  close(r.heterogeneity.tau2CI.upper, REF.RR.tau2CI[1], 1e-8, "tau2 CI upper");
  close(r.heterogeneity.pQ, REF.RR.pQ, 1e-6, "p(Q)");
  close(r.prediction.lower, REF.RR.REML.prediction[0], 1e-6, "PI lower");
  close(r.prediction.upper, REF.RR.REML.prediction[1], 1e-6, "PI upper");
  // metafor's README (github.com/wviechtb/metafor, retrieved 2026-11-16) fits these trials with
  // rma(yi, vi, test = "knha") and prints: tau^2 0.3132, I^2 92.22%, Q(12) = 152.2330,
  // estimate -0.7145, se 0.1808, t -3.9522, p 0.0019, CI -1.1084 to -0.3206.
  assert.equal(r.tau2.toFixed(4), "0.3132");
  assert.equal((100 * r.heterogeneity.I2).toFixed(2), "92.22");
  assert.equal(r.heterogeneity.Q.toFixed(4), "152.2330");
  assert.equal(r.pooled.estimate.toFixed(4), "-0.7145");
  assert.equal(r.pooled.hk.se.toFixed(4), "0.1808");
  assert.equal(r.pooled.hk.t.toFixed(4), "-3.9522");
  assert.equal(r.pooled.hk.p.toFixed(4), "0.0019");
  assert.equal(r.pooled.hk.lower.toFixed(4), "-1.1084");
  assert.equal(r.pooled.hk.upper.toFixed(4), "-0.3206");
});

test("Egger's test matches statsmodels OLS", () => {
  const r = analyze({ csv: BCG });
  close(r.egger.intercept, REF.RR.egger.intercept, 1e-10, "intercept");
  close(r.egger.seIntercept, REF.RR.egger.se, 1e-10, "se");
  close(r.egger.p, REF.RR.egger.p, 1e-8, "p");
  assert.equal(eggerTest([0.1, 0.2], [0.1, 0.2]), null);
});

test("leave-one-out (DL) matches statsmodels refits", () => {
  const r = analyze({ csv: BCG, method: "DL" });
  assert.equal(r.leaveOneOut.length, 13);
  r.leaveOneOut.forEach((l, i) => {
    close(l.estimate, REF.RR.leaveOneOutDL[i].estimate, 1e-9, `loo ${i}`);
    close(l.tau2, REF.RR.leaveOneOutDL[i].tau2, 1e-9, `loo tau2 ${i}`);
  });
});

test("meta-regression on latitude: REML, DL and PM match the reference", () => {
  for (const method of ["REML", "DL", "PM"]) {
    const g = analyze({ csv: BCG, method, moderator: "ablat", leaveOneOut: false }).regression;
    const ref = REF.regressionAblat[method];
    const tol = method === "DL" ? 1e-9 : 1e-6;
    close(g.tau2, ref.tau2, tol, `${method} tau2`);
    close(g.intercept.estimate, ref.intercept, tol, `${method} intercept`);
    close(g.slope.estimate, ref.slope, tol, `${method} slope`);
    close(g.slope.se, ref.seSlope, tol, `${method} se`);
    close(g.QE.stat, ref.QE, 1e-9, `${method} QE`);
  }
  const g = analyze({ csv: BCG, moderator: "ablat" }).regression;
  close(g.R2, REF.regressionAblat.REML.R2, 1e-5, "R2");
  assert.ok(g.slope.p < 1e-4);
  // metafor's README: rma(yi, vi, mods = ~ ablat, test = "knha") prints tau^2 0.0764, I^2 68.39%,
  // R^2 75.62%, QE(11) = 30.7331, intercept 0.2515 (se 0.2839), ablat -0.0291 (se 0.0082,
  // t -3.5483, p 0.0046, CI -0.0472 to -0.0111). tau^2 here is 0.076348, the value scipy's direct
  // maximisation finds; metafor's REML stops at its own convergence threshold, so its tau^2 and what
  // follows from it can differ in the last printed digit. Each figure is checked to 1.5 units of
  // that digit.
  const printed = [
    [g.tau2, 0.0764, 4], [100 * g.I2residual, 68.39, 2], [100 * g.R2, 75.62, 2], [g.QE.stat, 30.7331, 4],
    [g.intercept.estimate, 0.2515, 4], [g.intercept.hk.se, 0.2839, 4], [g.slope.estimate, -0.0291, 4],
    [g.slope.hk.se, 0.0082, 4], [g.slope.hk.t, -3.5483, 4], [g.slope.hk.p, 0.0046, 4],
    [g.slope.hk.lower, -0.0472, 4], [g.slope.hk.upper, -0.0111, 4],
  ];
  for (const [ours, theirs, dp] of printed) assert.ok(Math.abs(ours - theirs) <= 1.5 * 10 ** -dp, `${ours} vs metafor ${theirs}`);
});

test("zero cells get 0.5 in every cell; double zeros are left out with a reason", () => {
  const rows = REF.zeroCells.table.map((t, i) => `S${i + 1},${t.join(",")}`);
  const r = readStudies({ csv: `study,ai,bi,ci,di\n${rows.join("\n")}\nS5,0,40,0,40\n`, measure: "OR" });
  assert.equal(r.studies.length, 4);
  r.studies.forEach((s, i) => {
    close(s.yi, REF.zeroCells.yi_or[i], 1e-12, `yi ${i}`);
    close(s.vi, REF.zeroCells.vi_or[i], 1e-12, `vi ${i}`);
  });
  assert.deepEqual(r.studies.map((s) => s.corrected), [true, false, true, false]);
  assert.equal(r.dropped[0].label, "S5");
  assert.match(r.warnings.join(" "), /2 studies have a zero cell/);
  assert.equal(binaryEffect("RD", 0, 10, 0, 10).error.includes("zero variance"), true);
});

test("events-and-totals layout gives the same answer as 2x2 cells", () => {
  const { header, rows } = parseCsv(BCG);
  const idx = (n) => header.indexOf(n);
  const csv = "study,events_t,n_t,events_c,n_c\n" + rows.map((r) => [r[idx("author")], r[idx("tpos")], +r[idx("tpos")] + +r[idx("tneg")], r[idx("cpos")], +r[idx("cpos")] + +r[idx("cneg")]].join(",")).join("\n");
  const a = analyze({ csv, leaveOneOut: false }), b = analyze({ csv: BCG, leaveOneOut: false });
  assert.equal(a.input.layout, "totals");
  close(a.pooled.estimate, b.pooled.estimate, 1e-12, "same pooled");
  close(a.tau2, b.tau2, 1e-12, "same tau2");
});

test("estimate with a confidence interval is read as a ratio and pooled on the log scale", () => {
  const s = readStudies({ csv: BCG });
  const z = normQuantile(0.975);
  const csv = "study,rr,lower,upper\n" + s.studies.map((x) => `${x.label},${Math.exp(x.yi)},${Math.exp(x.yi - z * Math.sqrt(x.vi))},${Math.exp(x.yi + z * Math.sqrt(x.vi))}`).join("\n");
  const r = analyze({ csv, leaveOneOut: false });
  assert.equal(r.input.layout, "generic-ci");
  assert.equal(r.input.ratio, true);
  close(r.pooled.estimate, REF.RR.REML.estimate, 1e-6, "pooled from CIs");
  // The same columns on the raw scale when told so.
  const raw = analyze({ csv, ratio: "no", leaveOneOut: false });
  assert.equal(raw.input.ratio, false);
  // yi + sei on the log scale, no ratio.
  const se = analyze({ csv: "name,yi,sei\n" + s.studies.map((x) => `${x.label},${x.yi},${Math.sqrt(x.vi)}`).join("\n"), leaveOneOut: false });
  close(se.pooled.estimate, REF.RR.REML.estimate, 1e-6, "pooled from yi, sei");
  assert.equal(se.input.ratio, false);
});

test("continuous outcomes: Hedges' g matches statsmodels, MD by formula, and pooled g matches DL", () => {
  const rows = REF.continuous.rows;
  const csv = "study,mean1,sd1,n1,mean2,sd2,n2\n" + rows.map((r, i) => `T${i + 1},${r.join(",")}`).join("\n");
  const s = readStudies({ csv });
  assert.equal(s.layout, "continuous");
  assert.equal(s.measure, "SMD");
  s.studies.forEach((st, i) => {
    close(st.yi, REF.continuous.g[i], 1e-12, `g ${i}`);
    close(st.vi, REF.continuous.vg[i], 1e-12, `vg ${i}`);
  });
  const md = readStudies({ csv, measure: "MD" });
  md.studies.forEach((st, i) => {
    close(st.yi, REF.continuous.md[i], 1e-12, `md ${i}`);
    close(st.vi, REF.continuous.vmd[i], 1e-12, `vmd ${i}`);
  });
  const r = analyze({ csv, method: "DL" });
  close(r.pooled.estimate, REF.continuous.smd.DL.estimate, 1e-9, "pooled g");
  close(r.tau2, REF.continuous.smd.DL.tau2, 1e-9, "tau2 g");
  assert.equal(continuousEffect("SMD", 1, 0, 10, 1, 1, 10).error, "standard deviations must be positive");
});

test("properties: order invariance, shift equivariance, FE equals REML when tau2 is zero", () => {
  const s = readStudies({ csv: BCG });
  const y = s.studies.map((x) => x.yi), v = s.studies.map((x) => x.vi);
  const perm = [5, 2, 12, 0, 7, 9, 1, 11, 3, 8, 4, 10, 6];
  const a = fitModel(y, v, y.map(() => [1])), b = fitModel(perm.map((i) => y[i]), perm.map((i) => v[i]), y.map(() => [1]));
  close(a.coefs[0].estimate, b.coefs[0].estimate, 1e-12, "order");
  close(a.tau2, b.tau2, 1e-10, "order tau2");
  const c = fitModel(y.map((t) => t + 3), v, y.map(() => [1]));
  close(c.coefs[0].estimate, a.coefs[0].estimate + 3, 1e-10, "shift");
  close(c.tau2, a.tau2, 1e-9, "shift tau2");
  // Homogeneous studies: identical effects, so tau2 = 0 and every method equals FE.
  const yy = [0.2, 0.2, 0.2, 0.2], vv = [0.01, 0.02, 0.04, 0.03];
  for (const m of ["REML", "DL", "PM"]) {
    const f = fitModel(yy, vv, yy.map(() => [1]), { method: m });
    assert.equal(f.tau2, 0, m);
    close(f.coefs[0].estimate, 0.2, 1e-12, m);
  }
  const prof = fitModel(yy, vv, yy.map(() => [1])).heterogeneity.tau2CI;
  assert.deepEqual(prof, { lower: 0, upper: 0 });
});

test("input checks and readable errors", () => {
  assert.throws(() => analyze({ csv: "a,b\n1,2\n" }), /could not find the columns/);
  assert.throws(() => analyze({ csv: "study,yi,sei\nA,0.1,0.1\n" }), /at least two usable studies/);
  assert.throws(() => analyze({ csv: BCG, method: "ML" }), /unknown method/);
  assert.throws(() => analyze({ csv: BCG, moderator: "nope" }), /no moderator column/);
  assert.throws(() => analyze({ csv: BCG, measure: "SMD" }), /RR, OR or RD/);
  assert.throws(() => detectLayout(["x"], "cells", { ai: "zzz" }), /no column named "zzz"/);
  assert.equal(toNumber("1,234.5"), 1234.5);
  assert.equal(toNumber("0,25"), 0.25);
  assert.equal(toNumber("(0.3)"), -0.3);
  assert.ok(Number.isNaN(toNumber("NA")));
  const semi = analyze({ csv: "study;yi;sei\nA;0,1;0,05\nB;0,3;0,1\nC;0,2;0,08\n", leaveOneOut: false });
  assert.equal(semi.k, 3);
  const two = analyze({ csv: "study,yi,sei\nA,0.1,0.1\nB,0.5,0.1\n" });
  assert.equal(two.prediction, null);
  assert.match(two.warnings.join(" "), /two studies/);
});

test("summary in words, constants, and formatting", () => {
  const r = analyze({ csv: BCG, moderator: "ablat" });
  assert.match(r.summary[0], /^Pooled risk ratio: 0\.489 \(95% CI 0\.344 to 0\.696, p < 0\.0001\) from 13 studies/);
  assert.match(r.summary.join(" "), /51% lower risk/);
  assert.match(r.summary.join(" "), /prediction interval .* 0\.134 to 1\.785, which includes no effect/);
  assert.match(r.summary.join(" "), /explaining 75\.6% of the between-study variance/);
  assert.ok(PAPERS.length >= 9 && PAPERS.every((p) => p.authors && p.title && p.year && p.url && p.implemented));
  assert.equal(DEFAULTS.method, "REML");
  assert.equal(fmt(0.33), "0.330");
  assert.equal(fmt(12345.6), "12,346");
  assert.equal(formatP(0.00001), "< 0.0001");
  assert.equal(pEq(0.2), "p = 0.200");
  assert.doesNotThrow(() => JSON.stringify(r));
});
