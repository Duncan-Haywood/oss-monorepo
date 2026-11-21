// GARCH(1,1) noise for `meanvar` cuts (`--garch`): the conditional-sd filter, the segment quasi-likelihood (Gaussian and
// Student t), its changeIntervals cost, and the forward cut search with model choice. Moved out of engine.mjs on
// 2026-11-21 unchanged (README "Code layout"); engine.mjs re-exports every name, so existing imports keep working.

import { lgamma } from './stats-core.mjs';

/**
 * Conditional sd of a GARCH(1,1) fitted by Gaussian quasi-maximum likelihood to the series less its median
 * (h[t] = omega + alpha e[t-1]^2 + beta h[t-1], h[0] the sample variance). Grid search over (alpha, beta) with the
 * unconditional variance matched to the sample variance (variance targeting), then a local refinement. For
 * eval/meanvar-garch-filter.mjs; falls back to a constant sd when nothing beats it.
 */
export function garchSigma(x) {
  const n = x.length, ord = [...x].sort((a, b) => a - b), med = ord[Math.floor(n / 2)];
  const e2 = x.map((c) => (c - med) ** 2), v = e2.reduce((a, c) => a + c, 0) / n || 1;
  const h = (a, b) => { const w = v * (1 - a - b), o = new Array(n); o[0] = v; for (let t = 1; t < n; t++) o[t] = w + a * e2[t - 1] + b * o[t - 1]; return o; };
  const nll = (a, b) => { if (a < 0 || b < 0 || a + b >= 0.999) return Infinity; let s = 0; const o = h(a, b); for (let t = 0; t < n; t++) s += Math.log(o[t]) + e2[t] / o[t]; return s; };
  let best = [0, 0], bl = nll(0, 0);
  for (let a = 0.02; a <= 0.5; a += 0.04) for (let b = 0; b <= 0.97 - a; b += 0.05) { const l = nll(a, b); if (l < bl) { bl = l; best = [a, b]; } }
  for (let step = 0.02; step > 0.002; step /= 2) for (let k = 0; k < 20; k++) {
    let moved = false;
    for (const [da, db] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const l = nll(best[0] + da, best[1] + db); if (l < bl - 1e-9) { bl = l; best = [best[0] + da, best[1] + db]; moved = true; } }
    if (!moved) break;
  }
  return h(best[0], best[1]).map(Math.sqrt);
}

/**
 * `meanvar` cuts on clustered volatility (`garch: true`, CLI `--garch`). Each segment has its own mean and scale; inside a
 * segment the standardised residual follows a unit-variance GARCH(1,1) whose a and b are shared by all segments and read
 * off an 18-point grid (a + b under 0.98). A greedy forward search adds the cut, at any position, that raises the best-over-grid
 * quasi-log-likelihood most. It runs twice, with independent noise (a = b = 0) and on the GARCH grid, and keeps the cut
 * set with the highest LL - pen per cut - (garchPen if GARCH). Pre-registered against `--bootstrap` on fresh seeds
 * (eval/meanvar-garch-choose-prereg-2026-11-13.md, README "Cuts searched jointly with a GARCH likelihood").
 */
// Per-cut and GARCH-term penalties in multiples of ln n (log-likelihood units), fixed before the fresh-seed run.
export const GARCH_CUT_PEN = 1.5, GARCH_TERM_PEN = 0.25;
// Penalty on the Student t paths (garchCuts' tPen, off in analyze), in multiples of ln n: tuned in sample and run on fresh
// seeds, where it failed one line of the bar (eval/meanvar-tgarch-prereg-2026-11-13.md; README "Heavy tails in the GARCH
// search"). Eval only until a new pre-registration passes.
export const GARCH_T_PEN = 0.5;
export const GARCH_T_NUS = [4, 8];
export const GARCH_GRID = []; for (const a of [0, 0.05, 0.1, 0.2, 0.3]) for (const b of [0, 0.5, 0.7, 0.85, 0.93]) if (a + b < 0.98) GARCH_GRID.push([a, b]);

// quasi-log-lik of x[lo..hi) given (a, b), own mean and scale (two fixed-point passes), as in meanvar-garch-segments.mjs.
// With nu finite the standardised residual is a unit-variance Student t with nu degrees of freedom (Bollerslev 1987's
// t-GARCH); mean and scale then come from EM passes (each point weighted by (nu + 1) / (nu - 2 + z^2)), and the
// log-likelihood carries the t's normalising constant less the Gaussian's, so it compares with the Gaussian value
// (which omits -0.5 ln 2 pi per point) on one scale.
export function garchSegLL(x, lo, hi, a, b, nu = Infinity) {
  if (isFinite(nu)) return garchSegLLt(x, lo, hi, a, b, nu);
  let m = 0; for (let i = lo; i < hi; i++) m += x[i]; m /= hi - lo;
  let s2 = 0; for (let i = lo; i < hi; i++) s2 += (x[i] - m) ** 2; s2 = Math.max(s2 / (hi - lo), 1e-12);
  let ll = 0;
  for (let pass = 0; pass < 2; pass++) {
    let h = 1, num = 0; ll = 0;
    for (let i = lo; i < hi; i++) {
      const z2 = (x[i] - m) ** 2 / s2;
      ll += -0.5 * (Math.log(s2 * h) + z2 / h);
      num += z2 / h;
      h = (1 - a - b) + a * z2 + b * h;
    }
    s2 *= num / (hi - lo);
  }
  return ll;
}

const T_CONST = new Map();
function tConst(nu) {
  if (!T_CONST.has(nu)) T_CONST.set(nu, lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2)) + 0.5 * Math.log(2 * Math.PI));
  return T_CONST.get(nu);
}
export const GARCH_T_PASSES = 4;
function garchSegLLt(x, lo, hi, a, b, nu) {
  const len = hi - lo, c = tConst(nu);
  // start from the median and the Gaussian scale; EM passes move both toward the t fit
  let m = 0; for (let i = lo; i < hi; i++) m += x[i]; m /= len;
  let s2 = 0; for (let i = lo; i < hi; i++) s2 += (x[i] - m) ** 2; s2 = Math.max(s2 / len, 1e-12);
  let ll = 0;
  for (let pass = 0; pass <= GARCH_T_PASSES; pass++) {
    let h = 1, sw = 0, swx = 0, ss = 0; ll = 0;
    for (let i = lo; i < hi; i++) {
      const z2 = (x[i] - m) ** 2 / s2, q = z2 / h;
      ll += c - 0.5 * Math.log(s2 * h) - 0.5 * (nu + 1) * Math.log1p(q / (nu - 2));
      const w = (nu + 1) / (nu - 2 + q);
      sw += w / h; swx += w * x[i] / h; ss += w * q;
      h = (1 - a - b) + a * z2 + b * h;
    }
    if (pass === GARCH_T_PASSES) break;
    s2 = Math.max(s2 * ss / len, 1e-12);
    m = swx / sw;
  }
  return ll;
}

// The GARCH segment likelihood as a changeIntervals cost (twice the negative log-likelihood, a and b fixed), so the 95%
// range of a `--garch` cut comes from the model that chose it (README, "A range from the GARCH fit").
export function garchCost(x, a, b) { return (lo, hi) => -2 * garchSegLL(x, lo, hi, a, b); }

// Greedy forward search. Returns { cuts, gains }: cuts in the order added, gains[k] the likelihood rise of step k.
// Stops when the best gain falls under minPen or no segment can be split.
export function garchForward(x, { minPen, minSeg = 10, maxCuts = 8, grid = GARCH_GRID, stride = 1 } = {}) {
  const n = x.length; let cuts = []; const added = [], gains = [];
  const segsOf = (c) => { const e = [0, ...c.slice().sort((p, q) => p - q), n]; return e.slice(0, -1).map((lo, k) => [lo, e[k + 1]]); };
  // per grid point, the LL of each current segment
  let cache = grid.map(([a, b, nu]) => segsOf(cuts).map(([lo, hi]) => garchSegLL(x, lo, hi, a, b, nu)));
  let cur = Math.max(...cache.map((s) => s.reduce((p, q) => p + q, 0)));
  const base = cur;
  // best (LL, cut, segment) over positions t in [from, to] of the given segments, stepping by `step`
  const scan = (segs, ks, from, to, step) => {
    let bestLL = -Infinity, bestT = -1, bestK = -1;
    for (let g = 0; g < grid.length; g++) {
      const [a, b, nu] = grid[g], tot = cache[g].reduce((p, q) => p + q, 0);
      for (const k of ks) {
        const [lo, hi] = segs[k];
        for (let t = Math.max(lo + minSeg, from ?? -Infinity); t <= Math.min(hi - minSeg, to ?? Infinity); t += step) {
          const v = tot - cache[g][k] + garchSegLL(x, lo, t, a, b, nu) + garchSegLL(x, t, hi, a, b, nu);
          if (v > bestLL) { bestLL = v; bestT = t; bestK = k; }
        }
      }
    }
    return { bestLL, bestT, bestK };
  };
  while (added.length < maxCuts) {
    const segs = segsOf(cuts);
    // long series: a coarse pass every `stride` points, then every point within a stride of the coarse best
    let { bestLL, bestT, bestK } = scan(segs, segs.map((_, k) => k), null, null, stride);
    if (stride > 1 && bestT >= 0) ({ bestLL, bestT } = scan(segs, [bestK], bestT - stride + 1, bestT + stride - 1, 1));
    if (bestT < 0 || bestLL - cur < minPen) break;
    gains.push(bestLL - cur); added.push(bestT); cuts = [...cuts, bestT];
    cache = grid.map(([a, b, nu]) => segsOf(cuts).map(([lo, hi]) => garchSegLL(x, lo, hi, a, b, nu)));
    cur = Math.max(...cache.map((s) => s.reduce((p, q) => p + q, 0)));
  }
  return { cuts: added, gains, base };
}

// Model choice on top of the search: the GARCH terms must earn their keep too. Runs the forward search twice, once with
// independent noise (grid a = b = 0, i.e. plain mean-and-variance segments) and once on the GARCH grid, and keeps the
// cut set with the highest LL - pen x cuts - (GARCH ? garchPen : 0). On noise with no clustering a variance step is then
// a cut, not a GARCH path that partly explains it away. Penalties in log-likelihood units.
export function garchCuts(x, { pen, garchPen, tPen = null, nus = GARCH_T_NUS, minSeg = 10, maxCuts = 8, stride = 1 } = {}) {
  let bestScore = -Infinity, best = null;
  // tPen null: Gaussian innovations only (the 2026-11-13 search). Otherwise also Student t innovations, nu from `nus`,
  // each t path paying tPen on top.
  const withNu = (g, nu) => g.map(([a, b]) => [a, b, nu]);
  const paths = [[false, false, [[0, 0]]], [true, false, GARCH_GRID]];
  if (tPen != null) paths.push([false, true, nus.flatMap((nu) => withNu([[0, 0]], nu))], [true, true, nus.flatMap((nu) => withNu(GARCH_GRID, nu))]);
  for (const [garch, heavy, grid] of paths) {
    const { cuts, gains, base } = garchForward(x, { minPen: pen, minSeg, maxCuts, grid, stride });
    let ll = base;
    for (let k = 0; k <= cuts.length; k++) {
      if (k) ll += gains[k - 1];
      const score = ll - pen * k - (garch ? garchPen : 0) - (heavy ? tPen : 0);
      if (score > bestScore) { bestScore = score; best = { cuts: cuts.slice(0, k), garch, heavy, grid }; }
    }
  }
  // the shared (a, b, nu) of the kept fit, for the report
  const e = [0, ...best.cuts.slice().sort((p, q) => p - q), x.length];
  let top = -Infinity;
  for (const [a, b, nu = Infinity] of best.grid) {
    let t = 0; for (let k = 0; k + 1 < e.length; k++) t += garchSegLL(x, e[k], e[k + 1], a, b, nu);
    if (t > top) { top = t; best.a = a; best.b = b; best.nu = nu; }
  }
  delete best.grid;
  // the GARCH path can end on a = b = 0; the same cuts then score higher without the GARCH term
  if (best.garch && best.a === 0 && best.b === 0) best.garch = false;
  return best;
}
