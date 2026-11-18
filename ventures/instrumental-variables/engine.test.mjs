import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseCsv, buildDesign, kClass, limlKappa, invert, cross, firstStage, andersonRubinStat, andersonRubinSet, chi2ppf, fppf, normppf, tppf, chi2sf, fsf, symEigenvalues, minGeneralizedEigenvalue, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

const close = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(R) { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
/** y = 1 + beta x + u, x = pi z + v, corr(u, v) = rho; z1 binary, z2 normal. */
function sim({ n = 2000, beta = 0.5, pi = [0.8, 0.5], rho = 0.6, seed = 1, noise = 1 } = {}) {
  const R = rng(seed), rows = [];
  for (let i = 0; i < n; i++) {
    const z1 = R() < 0.5 ? 1 : 0, z2 = normal(R), w = normal(R);
    const e1 = normal(R), e2 = normal(R);
    const v = e1, u = noise * (rho * e1 + Math.sqrt(1 - rho * rho) * e2);
    const x = pi[0] * z1 + pi[1] * z2 + 0.3 * w + v;
    rows.push({ y: String(1 + beta * x + 0.4 * w + u), x: String(x), z1: String(z1), z2: String(z2), w: String(w), g: String(i % 40), grp: ["a", "b", "c"][i % 3] });
  }
  return rows;
}
const designOf = (rows, spec = {}) => buildDesign(rows, { outcome: "y", endogenous: "x", instruments: "z1,z2", exogenous: "w", ...spec });

test("distribution quantiles hit textbook values", () => {
  close(normppf(0.975), 1.959963984540054, 1e-12, "z");
  close(chi2ppf(0.95, 1), 3.841458820694124, 1e-10, "chi2(1)");
  close(chi2ppf(0.95, 2), 5.991464547107979, 1e-10, "chi2(2)");
  close(tppf(0.975, 10), 2.2281388519649385, 1e-10, "t(10)");
  close(fppf(0.95, 2, 10), 4.102821015130402, 1e-9, "F(2,10)");
  close(chi2sf(3.841458820694124, 1), 0.05, 1e-12, "chi2 sf");
  close(fsf(4.102821015130402, 2, 10), 0.05, 1e-12, "F sf");
});

test("eigen helpers: Jacobi eigenvalues and the generalized minimum root", () => {
  const ev = symEigenvalues([[2, 1, 0], [1, 2, 0], [0, 0, 5]]);
  [1, 3, 5].forEach((v, i) => close(ev[i], v, 1e-12, "eig"));
  close(minGeneralizedEigenvalue([[4, 0], [0, 9]], [[1, 0], [0, 1]]), 4, 1e-12, "gen");
  close(minGeneralizedEigenvalue([[4, 0], [0, 9]], [[2, 0], [0, 1]]), 2, 1e-12, "gen scaled");
});

test("2SLS recovers the effect that OLS gets wrong when x is endogenous", () => {
  const d = designOf(sim({ n: 20000, seed: 3 }));
  const j = d.exog.length;
  const ols = kClass({ y: d.y, X: d.X, Z: d.X, k: 0 });
  const tsls = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1 });
  assert.ok(ols.beta[j] - 0.5 > 0.2, `OLS should be biased up: ${ols.beta[j]}`);
  close(tsls.beta[j], 0.5, 3 * tsls.se[j], "2SLS within 3 SE");
});

test("with no endogeneity, OLS and 2SLS agree and the exogeneity tests do not reject", () => {
  const r = analyze({ records: sim({ n: 4000, rho: 0, seed: 5 }), outcome: "y", endogenous: "x", instruments: "z1,z2", exogenous: "w" });
  close(r.models.ols.terms[2].coef, r.models["2sls"].terms[2].coef, 0.05, "OLS vs 2SLS");
  for (const t of r.exogeneity) assert.ok(t.p > 0.01, `${t.name} p ${t.p}`);
});

test("just identified, one binary instrument, no controls: 2SLS is the Wald ratio and LIML has k = 1", () => {
  const rows = sim({ n: 3000, seed: 9 });
  const d = buildDesign(rows, { outcome: "y", endogenous: "x", instruments: "z1" });
  const fit = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1 });
  const m = (a, sel) => { const v = a.filter((_, i) => sel(i)); return v.reduce((s, x) => s + x, 0) / v.length; };
  const z = rows.map((r) => Number(r.z1));
  const wald = (m(d.y, (i) => z[i] === 1) - m(d.y, (i) => z[i] === 0)) / (m(d.endog[0], (i) => z[i] === 1) - m(d.endog[0], (i) => z[i] === 0));
  close(fit.beta[1], wald, 1e-10, "Wald ratio");
  close(limlKappa(d, invert(cross(d.Z, d.Z))), 1, 1e-10, "LIML k");
});

test("effective F equals the F under unadjusted errors and the robust Wald with one instrument", () => {
  const rows = sim({ n: 1500, seed: 11 });
  const d = designOf(rows);
  const u = firstStage(d, { se: "unadjusted", alpha: 0.05 })[0];
  close(u.effectiveF, u.F, 1e-9 * u.F, "unadjusted");
  const d1 = designOf(rows, { instruments: "z2" });
  const r = firstStage(d1, { se: "robust", alpha: 0.05 })[0];
  close(r.effectiveF, r.wald, 1e-9 * r.wald, "robust, one instrument");
  assert.ok(u.partialR2 > 0 && u.partialR2 < 1);
});

test("Anderson-Rubin: the statistic equals the critical value at both ends of the set, homoskedastic and clustered", () => {
  const d = designOf(sim({ n: 2000, seed: 13 }), { cluster: "g" });
  for (const se of ["unadjusted", "robust", "clustered"]) {
    const opts = { se, clusters: d.clusters, debiased: false };
    const tsls = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, se: "unadjusted" });
    const set = andersonRubinSet(d, tsls, opts, 0.05);
    assert.equal(set.kind, "interval", se);
    for (const b of set.intervals[0]) close(andersonRubinStat(d, b, opts).stat, set.crit, 1e-6 * set.crit, `${se} at ${b}`);
    const mid = (set.intervals[0][0] + set.intervals[0][1]) / 2;
    assert.ok(andersonRubinStat(d, mid, opts).stat < set.crit);
  }
});

test("Anderson-Rubin set is unbounded when the instruments are irrelevant, and 2SLS's reading warns", () => {
  const rows = sim({ n: 1000, pi: [0, 0], seed: 17 });
  for (const se of ["unadjusted", "robust"]) {
    const r = analyze({ records: rows, outcome: "y", endogenous: "x", instruments: "z1,z2", exogenous: "w", se });
    assert.notEqual(r.andersonRubin.kind, "interval", `${se}: ${JSON.stringify(r.andersonRubin.intervals)}`);
    assert.ok(r.andersonRubin.intervals.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b)));
    assert.ok(r.notes.some((n) => /first stage is weak/.test(n)));
  }
});

test("LIML k is at least 1 when overidentified, and Fuller sits between 2SLS and LIML", () => {
  const d = designOf(sim({ n: 800, pi: [0.2, 0.1], seed: 19 }));
  const ZZinv = invert(cross(d.Z, d.Z));
  const kL = limlKappa(d, ZZinv);
  assert.ok(kL >= 1);
  const j = d.exog.length;
  const b = (k) => kClass({ y: d.y, X: d.X, Z: d.Z, k, ZZinv }).beta[j];
  const [t, l, f] = [b(1), b(kL), b(kL - 1 / (d.n - d.kz))];
  assert.ok((f - t) * (f - l) <= 0, `Fuller ${f} between 2SLS ${t} and LIML ${l}`);
});

test("text controls become indicators; rows with missing values are dropped and noted", () => {
  const rows = sim({ n: 600, seed: 23 });
  rows[5].y = "";
  rows[7].z1 = "NA";
  const r = analyze({ records: rows, outcome: "y", endogenous: "x", instruments: "z1,z2", exogenous: "w,grp" });
  assert.equal(r.n, 598);
  assert.deepEqual(r.models.ols.terms.map((t) => t.name), ["const", "w", "grp=b", "grp=c", "x"]);
  assert.ok(r.notes.some((n) => /2 rows/.test(n)));
  assert.ok(r.notes.some((n) => /"grp" is text/.test(n)));
});

test("clustered errors with few clusters warn; Hansen J needs more clusters than moments", () => {
  const rows = sim({ n: 400, seed: 29 }).map((r, i) => ({ ...r, g: String(i % 4) }));
  const r = analyze({ records: rows, outcome: "y", endogenous: "x", instruments: "z1,z2", exogenous: "w", se: "clustered", cluster: "g" });
  assert.ok(r.notes.some((n) => /Only 4 clusters/.test(n)));
  assert.match(r.overid.find((t) => t.name === "Hansen J").error, /more clusters/);
});

test("bad specifications fail with a reason", () => {
  const rows = sim({ n: 100, seed: 31 });
  const base = { records: rows, outcome: "y", endogenous: "x", instruments: "z1", exogenous: "w" };
  assert.throws(() => analyze({ ...base, instruments: "" }), /at least one instrument/);
  assert.throws(() => analyze({ ...base, endogenous: "x,w", exogenous: "" }), /under-identified/);
  assert.throws(() => analyze({ ...base, instruments: "nope" }), /No column named "nope"/);
  assert.throws(() => analyze({ ...base, exogenous: "z1" }), /named twice/);
  assert.throws(() => analyze({ ...base, se: "clustered" }), /cluster column/);
  assert.throws(() => analyze({ ...base, se: "hac" }), /se must be/);
  assert.throws(() => analyze({ ...base, estimator: "gmm" }), /estimator must be/);
  assert.throws(() => analyze({ ...base, alpha: 0.7 }), /alpha/);
  assert.throws(() => analyze({ ...base, instruments: "z1,z2", records: rows.map((r) => ({ ...r, z2: r.z1 })) }), /singular/);
  assert.throws(() => parseCsv(""), /empty/);
});

test("the example: OLS overstates, 2SLS and the AR set cover the true 0.08, and the reading says so", () => {
  const r = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, se: "clustered" });
  assert.equal(r.n, 3000);
  assert.equal(r.clusters, 150);
  const j = r.models.ols.terms.findIndex((t) => t.name === "education_years");
  close(r.models.ols.terms[j].coef, 0.1071026593910478, 1e-10, "OLS");
  close(r.models["2sls"].terms[j].coef, 0.06368356225817706, 1e-10, "2SLS");
  const [lo, hi] = r.models["2sls"].terms[j].ci;
  assert.ok(lo < 0.08 && 0.08 < hi);
  assert.ok(r.andersonRubin.intervals[0][0] < 0.08 && 0.08 < r.andersonRubin.intervals[0][1]);
  assert.match(r.summary, /2SLS estimate for education_years: 0\.0637/);
  assert.match(r.summary, /Hansen J/);
  close(r.overid.find((t) => t.name === "Hansen J").p, 0.1394, 5e-4, "Hansen J p");
  close(r.overid.find((t) => t.name === "Sargan").p, 0.0287, 5e-4, "Sargan p");
});

test("PAPERS entries are complete", () => {
  assert.ok(PAPERS.length >= 10);
  for (const p of PAPERS) for (const k of ["key", "authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.key} ${k}`);
});
