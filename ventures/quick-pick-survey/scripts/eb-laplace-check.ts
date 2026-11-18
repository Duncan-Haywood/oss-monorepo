/**
 * Is the Laplace evidence (src/lib/btRefit.ts, refitEvidence) the reason the
 * empirical-Bayes prior sd under the staged selector falls to its floor? For
 * a few short synthetic respondents (8 items, 2 answers each), compares the
 * Laplace log evidence over a grid of prior sds with an importance-sampled
 * one (draws from the Laplace posterior inflated 1.5x, a Student-t-free
 * Gaussian proposal; the log-mean-exp estimate's standard error is printed),
 * summed over respondents, for each selector. If both curves peak in the
 * same place the approximation is not the cause.
 *
 *   npx tsx scripts/eb-laplace-check.ts [--seeds 12] [--items 8] [--per-item 2] [--draws 20000]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { refitRatings, refitEvidence, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "12"));
const items = Number(opt("--items", "8"));
const perItem = Number(opt("--per-item", "2"));
const draws = Number(opt("--draws", "20000"));
const grid = [0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0];
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Importance-sampled log p(y | phi) with the same constants dropped as refitEvidence: + n log(2 pi) / 2 ... see below. */
function isEvidence(ids: string[], answers: RefitAnswer[], phi: number, seed: number) {
  const n = ids.length;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const fit = refitRatings(ids, answers, { priorPhi: phi });
  const inflate = 1.5;
  // Cholesky of inflate^2 * cov.
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = inflate * inflate * fit.cov[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    L[i * n + j] = i === j ? Math.sqrt(s) : s / L[j * n + j];
  }
  let logDetL = 0;
  for (let i = 0; i < n; i++) logDetL += Math.log(L[i * n + i]);
  const rand = mulberry32(seed);
  const logw: number[] = [];
  const z = new Float64Array(n), x = new Float64Array(n);
  for (let d = 0; d < draws; d++) {
    for (let a = 0; a < n; a++) {
      const u = 1 - rand(), v = rand();
      z[a] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    let zz = 0;
    for (let a = 0; a < n; a++) {
      let s = fit.mu[a];
      for (let b = 0; b <= a; b++) s += L[a * n + b] * z[b];
      x[a] = s;
      zz += z[a] * z[a];
    }
    let ll = 0;
    for (const { winner, loser, tie } of answers) {
      const dd = x[idx.get(winner)!] - x[idx.get(loser)!];
      const sc = tie ? 0.5 : 1;
      ll -= sc * Math.log1p(Math.exp(-dd)) + (1 - sc) * Math.log1p(Math.exp(dd));
    }
    let lp = 0;
    for (let a = 0; a < n; a++) lp -= (0.5 * x[a] * x[a]) / (phi * phi);
    lp -= n * Math.log(phi);
    const lq = -0.5 * zz - logDetL;
    logw.push(ll + lp - lq);
  }
  const m = Math.max(...logw);
  const w = logw.map((v) => Math.exp(v - m));
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1));
  // Both estimates drop -n/2 log(2 pi) from the prior and the proposal alike, so they share constants with refitEvidence.
  return { value: m + Math.log(mean), se: sd / mean / Math.sqrt(w.length) };
}

for (const sel of Object.keys(SELECTORS)) {
  const lap = grid.map(() => 0), imp = grid.map(() => 0);
  let maxSe = 0;
  for (let s = 0; s < nSeeds; s++) {
    const r = simulate(SELECTORS[sel], items, perItem * items, 1000 + 7 * s);
    const ids = [...r.truth.keys()];
    const answers = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
    grid.forEach((phi, g) => {
      lap[g] += refitEvidence(ids, answers, phi);
      const e = isEvidence(ids, answers, phi, 99 + s);
      imp[g] += e.value;
      maxSe = Math.max(maxSe, e.se);
    });
  }
  const peak = (v: number[]) => grid[v.indexOf(Math.max(...v))];
  const rel = (v: number[]) => v.map((x) => Number((x - Math.max(...v)).toFixed(2)));
  console.log(JSON.stringify({ selector: sel, items, perItem, seeds: nSeeds, grid, laplace: rel(lap), sampled: rel(imp), peakLaplace: peak(lap), peakSampled: peak(imp), maxRelSe: Number(maxSe.toFixed(3)) }));
}
