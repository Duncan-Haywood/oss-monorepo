// Cuts searched jointly with a segment-wise GARCH(1,1) likelihood (README, "Pruning meanvar cuts with a segment-wise
// GARCH likelihood": the prune of plain meanvar cuts removed the true variance break, and "candidates searched jointly
// with the GARCH fit" was the open route).
//
// Same likelihood as eval/meanvar-garch-segments.mjs: each segment has its own mean and scale, and inside a segment the
// standardised residual follows a unit-variance GARCH(1,1) whose a and b are shared by all segments (the same grid).
// Instead of pruning meanvar's cuts, a greedy forward search adds, at each step, the one cut at any position (segments at
// least `minSeg` long) that raises the best-over-grid quasi-log-likelihood most, and stops when the best gain is under
// the penalty. Forward search is nested, so one run to the smallest penalty gives the answer at every larger one: the
// cut count at penalty p is the number of leading gains >= p.
//
// usage: node eval/meanvar-garch-binseg.mjs [reps] [seedShift] [pens, comma list of multiples of ln n]
// Seeds are those of meanvar-garch-segments.mjs, moved by seedShift (default 0, the in-sample seeds).
const reps = +process.argv[2] || 100;
const shift = +process.argv[3] || 0;
const PENS = (process.argv[4] || '1,1.5,2,2.5,3').split(',').map(Number);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
export const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
};
export const GRID = []; for (const a of [0, 0.05, 0.1, 0.2, 0.3]) for (const b of [0, 0.5, 0.7, 0.85, 0.93]) if (a + b < 0.98) GRID.push([a, b]);

// quasi-log-lik of x[lo..hi) given (a, b), own mean and scale (two fixed-point passes), as in meanvar-garch-segments.mjs
export function segLL(x, lo, hi, a, b) {
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

// Greedy forward search. Returns { cuts, gains }: cuts in the order added, gains[k] the likelihood rise of step k.
// Stops when the best gain falls under minPen or no segment can be split.
export function garchForward(x, { minPen, minSeg = 10, maxCuts = 8, grid = GRID } = {}) {
  const n = x.length; let cuts = []; const added = [], gains = [];
  const segsOf = (c) => { const e = [0, ...c.slice().sort((p, q) => p - q), n]; return e.slice(0, -1).map((lo, k) => [lo, e[k + 1]]); };
  // per grid point, the LL of each current segment
  let cache = grid.map(([a, b]) => segsOf(cuts).map(([lo, hi]) => segLL(x, lo, hi, a, b)));
  let cur = Math.max(...cache.map((s) => s.reduce((p, q) => p + q, 0)));
  const base = cur;
  while (added.length < maxCuts) {
    const segs = segsOf(cuts); let bestLL = -Infinity, bestT = -1;
    for (let g = 0; g < grid.length; g++) {
      const [a, b] = grid[g], tot = cache[g].reduce((p, q) => p + q, 0);
      for (let k = 0; k < segs.length; k++) {
        const [lo, hi] = segs[k];
        for (let t = lo + minSeg; t <= hi - minSeg; t++) {
          const v = tot - cache[g][k] + segLL(x, lo, t, a, b) + segLL(x, t, hi, a, b);
          if (v > bestLL) { bestLL = v; bestT = t; }
        }
      }
    }
    if (bestT < 0 || bestLL - cur < minPen) break;
    gains.push(bestLL - cur); added.push(bestT); cuts = [...cuts, bestT];
    cache = grid.map(([a, b]) => segsOf(cuts).map(([lo, hi]) => segLL(x, lo, hi, a, b)));
    cur = Math.max(...cache.map((s) => s.reduce((p, q) => p + q, 0)));
  }
  return { cuts: added, gains, base };
}

// Model choice on top of the search: the GARCH terms must earn their keep too. Runs the forward search twice, once with
// independent noise (grid a = b = 0, i.e. plain mean-and-variance segments) and once on the GARCH grid, and keeps the
// cut set with the highest LL - pen x cuts - (GARCH ? garchPen : 0). On noise with no clustering a variance step is then
// a cut, not a GARCH path that partly explains it away. Penalties in log-likelihood units.
export function garchChoose(x, { pen, garchPen, minSeg = 10, maxCuts = 8 } = {}) {
  let bestScore = -Infinity, best = null;
  for (const [garch, grid] of [[false, [[0, 0]]], [true, GRID]]) {
    const { cuts, gains, base } = garchForward(x, { minPen: pen, minSeg, maxCuts, grid });
    let ll = base;
    for (let k = 0; k <= cuts.length; k++) {
      if (k) ll += gains[k - 1];
      const score = ll - pen * k - (garch ? garchPen : 0);
      if (score > bestScore) { bestScore = score; best = { cuts: cuts.slice(0, k), garch }; }
    }
  }
  return best;
}

// cut count at penalty pen from a forward run: the leading gains that clear it
export const countAt = (gains, pen) => { let k = 0; while (k < gains.length && gains[k] >= pen) k++; return k; };

if (process.argv[1].endsWith('meanvar-garch-binseg.mjs')) {
  const lo = Math.min(...PENS);
  console.log(`reps ${reps} per cell, seed shift ${shift}, greedy forward search on the segment-wise GARCH likelihood, minSeg 10\n` +
    `per penalty (multiples of ln n): null any change / sd 1->2 exactly one / mean +1.5 exactly one`);
  console.log(`n | noise | ${PENS.map((p) => `pen ${p}`).join(' | ')}`);
  for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
    const ln = Math.log(n), tally = PENS.map(() => [0, 0, 0]);
    for (let k = 0; k < reps; k++) {
      const series = [
        gen(rng(5000 * n + 7 * k + 1 + shift), n),
        gen(rng(9000 * n + 7 * k + 3 + shift), n).map((x, i) => i < n / 2 ? x : 2 * x),
        gen(rng(13000 * n + 7 * k + 5 + shift), n).map((x, i) => i < n / 2 ? x : x + 1.5),
      ];
      series.forEach((v, j) => {
        const { gains } = garchForward(v, { minPen: lo * ln, maxCuts: j === 0 ? 1 : 2 });
        PENS.forEach((p, q) => { const c = countAt(gains, p * ln); if (j === 0 ? c > 0 : c === 1) tally[q][j]++; });
      });
    }
    console.log(`${n} | ${name.padEnd(5)} | ${tally.map((t) => t.map((v) => pct(v, reps)).join(' / ')).join(' | ')}`);
  }
}
