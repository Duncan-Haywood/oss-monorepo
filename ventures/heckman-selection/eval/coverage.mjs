// Monte Carlo coverage of the 95% intervals, on the example's design redrawn in
// JavaScript (eval/simulate.py's equations; region left out). Three scenarios:
//   A. as the example: rho 0.6, three exclusion restrictions
//   B. no selection bias: rho 0
//   C. no exclusion restriction: selection on educ and exper only, rho 0.6
// For each: mean estimate and coverage of the educ coefficient (true 0.085) by OLS
// on the selected rows, the two-step and maximum likelihood; coverage of the
// maximum-likelihood rho interval; how often the LR test and the two-step t-test
// reject rho = 0 at 5%.
//   node eval/coverage.mjs [reps=400] [seed=11] [n=1000]
import { probit, olsSelected, twoStep, heckmanMLE, normppf } from "../engine.mjs";

const reps = Number(process.argv[2] || 400), seed0 = Number(process.argv[3] || 11), N = Number(process.argv[4] || 1000);
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const nrm = () => { let x; do x = u(); while (x === 0); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  const pois = (lam) => { let k = 0, p = 1; const L = Math.exp(-lam); do { k++; p *= u(); } while (p > L); return k - 1; };
  return { u, nrm, pois };
}
const clip = (v, a, b) => Math.max(a, Math.min(b, v));

function draw(r, { rho, exclusion }) {
  const s = [], Z = [], X = [], y = [];
  for (let i = 0; i < N; i++) {
    const educ = clip(Math.round(12.8 + 2.3 * r.nrm()), 8, 20), exper = Math.round(30 * r.u());
    const k6 = Math.min(3, r.pois(0.35)), k18 = Math.min(5, r.pois(0.9));
    const inc = Math.round(10 * Math.exp(Math.log(35) + 0.03 * (educ - 12.8) + 0.6 * r.nrm())) / 10;
    const z1 = r.nrm(), z2 = r.nrm();
    const u = z1, e = 0.45 * (rho * z1 + Math.sqrt(1 - rho * rho) * z2);
    const star = exclusion
      ? 0.35 + 0.13 * (educ - 12) + 0.05 * exper - 0.0012 * exper ** 2 - 0.85 * k6 - 0.15 * k18 - 0.012 * (inc - 35) + u
      : -0.2 + 0.13 * (educ - 12) + 0.05 * exper - 0.0012 * exper ** 2 + u;
    const sel = star > 0 ? 1 : 0;
    s.push(sel);
    Z.push(exclusion ? [1, educ, exper, exper * exper, k6, k18, inc] : [1, educ, exper, exper * exper]);
    if (sel) { X.push([1, educ, exper, exper * exper]); y.push(1 + 0.085 * educ + 0.035 * exper - 0.0006 * exper ** 2 + e); }
  }
  const n1 = X.length;
  return { n: N, n1, n0: N - n1, s, Z, X, y, selIdx: s.flatMap((v, i) => (v ? [i] : [])), clusters: null };
}

const q = normppf(0.975);
const SCEN = [["A. example design, rho 0.6", { rho: 0.6, exclusion: true }], ["B. rho 0 (no selection bias)", { rho: 0, exclusion: true }], ["C. no exclusion restriction, rho 0.6", { rho: 0.6, exclusion: false }]];
const lines = [`reps ${reps}, n ${N}, seed ${seed0}; true educ coefficient 0.085`];
for (const [label, cfg] of SCEN) {
  const r = rng(seed0 * 1000 + SCEN.findIndex((x) => x[0] === label));
  const acc = { ols: [], two: [], mle: [], olsC: 0, twoC: 0, mleC: 0, rhoC: 0, lrRej: 0, tRej: 0, fail: 0, twoTrunc: 0, mleWidth: [], twoWidth: [], selRate: 0 };
  const t0 = Date.now();
  for (let k = 0; k < reps; k++) {
    const d = draw(r, cfg);
    acc.selRate += d.n1 / d.n;
    try {
      const pr = probit(d.Z, d.s), ols = olsSelected(d), two = twoStep(d, pr), m = heckmanMLE(d, { pr, two, ols });
      const cover = (b, s) => Math.abs(b - 0.085) <= q * s;
      acc.ols.push(ols.beta[1]); acc.two.push(two.beta[1]); acc.mle.push(m.beta[1]);
      acc.olsC += cover(ols.beta[1], Math.sqrt(ols.cov[1][1]));
      acc.twoC += cover(two.beta[1], Math.sqrt(two.cov[1][1]));
      acc.mleC += cover(m.beta[1], Math.sqrt(m.cov[1][1]));
      acc.twoWidth.push(2 * q * Math.sqrt(two.cov[1][1])); acc.mleWidth.push(2 * q * Math.sqrt(m.cov[1][1]));
      const a = m.atanhRho;
      acc.rhoC += Math.tanh(a.coef - q * a.se) <= cfg.rho && cfg.rho <= Math.tanh(a.coef + q * a.se);
      acc.lrRej += m.tests.lr.p < 0.05;
      acc.tRej += two.lamTest.p < 0.05;
      acc.twoTrunc += two.truncated;
    } catch { acc.fail++; }
  }
  const ok = reps - acc.fail;
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const median = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const pc = (x) => `${((100 * x) / ok).toFixed(1)}%`;
  lines.push("", `${label}: ${ok} fits (${acc.fail} failed), mean selected ${(100 * acc.selRate / reps).toFixed(1)}%, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  lines.push(`  educ mean estimate: OLS ${mean(acc.ols).toFixed(4)}, two-step ${mean(acc.two).toFixed(4)}, MLE ${mean(acc.mle).toFixed(4)}`);
  lines.push(`  educ 95% CI coverage: OLS ${pc(acc.olsC)}, two-step ${pc(acc.twoC)}, MLE ${pc(acc.mleC)}; median width two-step ${median(acc.twoWidth).toFixed(4)}, MLE ${median(acc.mleWidth).toFixed(4)}`);
  lines.push(`  MLE rho 95% CI coverage ${pc(acc.rhoC)}; reject rho = 0 at 5%: LR ${pc(acc.lrRej)}, two-step t ${pc(acc.tRej)}; two-step rho truncated ${pc(acc.twoTrunc)}`);
}
console.log(lines.join("\n"));
