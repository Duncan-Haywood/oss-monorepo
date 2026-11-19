// Is maximum likelihood finding the peak when there is no exclusion restriction?
// Scenario C of coverage.mjs, 60 draws (seed 4242): compare the engine's optimum with
// the log-likelihood at the true parameters. If the truth were ever higher, the
// optimiser would be stopping short; if never, the bias in coverage-output.txt is
// the estimator's, from a flat likelihood.   node eval/peak-check.mjs
import { probit, olsSelected, twoStep, heckmanMLE, normppf } from "../engine.mjs";

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
import { heckmanLogLik } from "../engine.mjs";
const reps = 60, N = 1000;
const r = rng(4242);
let better = 0, diffs = [];
for (let k = 0; k < reps; k++) {
  const d = draw(r, { rho: 0.6, exclusion: false });
  const pr = probit(d.Z, d.s), ols = olsSelected(d), two = twoStep(d, pr), m = heckmanMLE(d, { pr, two, ols });
  // likelihood at the truth (gamma on the probit scale is the true selection index)
  const truth = [1, 0.085, 0.035, -0.0006, -0.2 - 0.13 * 12, 0.13, 0.05, -0.0012, Math.atanh(0.6), Math.log(0.45)];
  const llT = heckmanLogLik(d, truth).ll;
  if (llT > m.ll + 1e-6) better++;
  diffs.push([m.ll - llT, m.beta[1], Math.tanh(m.atanhRho.coef)]);
}
console.log("truth beats engine optimum in", better, "of", reps);
console.log("first 12 draws: logL(engine) - logL(truth), ML educ (true 0.085), ML rho (true 0.6)");
console.log(diffs.slice(0, 12).map((x) => x.map((v) => v.toFixed(4)).join(" ")).join("\n"));
