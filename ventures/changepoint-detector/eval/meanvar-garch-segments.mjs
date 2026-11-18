// Segment-wise GARCH(1,1) pruning of meanvar changepoints (README "A GARCH filter removes..." left a joint fit open).
// Candidates: plain meanvar PELT cuts. Each segment k has its own mean m_k and scale s_k; within a segment the standardised
// residual follows a unit-variance GARCH(1,1) (omega = 1-a-b) with a, b shared by all segments (grid). The quasi-log-lik of a
// cut set is summed over segments; cuts are dropped backwards while the drop costs less than `pen` per cut.
// usage: node eval/meanvar-garch-segments.mjs [reps] [pen] [cap] [seedShift]   (seeded; cap = largest a+b on the grid,
// default 0.98; seedShift moves every seed so a fresh draw can be held out, default 0)
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 100;
const penMul = +process.argv[3] || 3;
const cap = +process.argv[4] || 0.98;
const shift = +process.argv[5] || 0;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
  ar1: (r, n) => { let p = 0; const o = []; for (let i = 0; i < n + 50; i++) { p = 0.5 * p + gauss(r); if (i >= 50) o.push(p / Math.sqrt(1 / (1 - 0.25))); } return o; },
};
const GRID = []; for (const a of [0, 0.05, 0.1, 0.2, 0.3]) for (const b of [0, 0.5, 0.7, 0.85, 0.93]) if (a + b < cap + 1e-9 && a + b < 0.98) GRID.push([a, b]);
// quasi-log-lik of one segment given (a,b): own mean and scale (two fixed-point passes for the scale)
function segLL(x, lo, hi, a, b) {
  const m = x.slice(lo, hi).reduce((s, v) => s + v, 0) / (hi - lo);
  let s2 = 0; for (let i = lo; i < hi; i++) s2 += (x[i] - m) ** 2; s2 /= hi - lo;
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
function total(x, cuts, a, b) { const e = [0, ...cuts, x.length]; let t = 0; for (let k = 0; k + 1 < e.length; k++) t += segLL(x, e[k], e[k + 1], a, b); return t; }
function best(x, cuts) { let m = -Infinity; for (const [a, b] of GRID) { const v = total(x, cuts, a, b); if (v > m) m = v; } return m; }
export function pruneByGarch(x, cuts, pen) {
  if (!cuts.every(Number.isInteger)) throw new TypeError('pruneByGarch takes cut indexes; map analyze() changepoints with c => c.index');
  let cur = cuts.slice(), ll = best(x, cur);
  for (;;) {
    let bi = -1, bl = -Infinity;
    for (let i = 0; i < cur.length; i++) { const c = cur.filter((_, j) => j !== i), l = best(x, c); if (l > bl) { bl = l; bi = i; } }
    if (bi < 0 || ll - bl >= pen) return cur;     // cheapest cut still earns its penalty
    cur = cur.filter((_, j) => j !== bi); ll = bl;
  }
}
if (process.argv[1].endsWith('meanvar-garch-segments.mjs')) {
  console.log(`reps ${reps} per cell, seeded, per-cut penalty ${penMul} ln n (log-likelihood units), grid a+b <= ${cap}, seed shift ${shift}\nn | noise | plain: null any change, sd1->2 exactly one, mean+1.5 exactly one | pruned: same three`);
  for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
    const pen = penMul * Math.log(n), out = [];
    for (const g of [false, true]) {
      let any = 0, one = 0, mean = 0;
      const run = (v) => { const c = analyze({ values: v, model: 'meanvar' }).pelt.changepoints.map((p) => p.index); return (g ? pruneByGarch(v, c, pen) : c).length; };
      for (let k = 0; k < reps; k++) {
        if (run(gen(rng(5000 * n + 7 * k + 1 + shift), n))) any++;
        if (run(gen(rng(9000 * n + 7 * k + 3 + shift), n).map((x, i) => i < n / 2 ? x : 2 * x)) === 1) one++;
        if (run(gen(rng(13000 * n + 7 * k + 5 + shift), n).map((x, i) => i < n / 2 ? x : x + 1.5)) === 1) mean++;
      }
      out.push(`${pct(any, reps)} / ${pct(one, reps)} / ${pct(mean, reps)}`);
    }
    console.log(`${n} | ${name.padEnd(5)} | ${out.join(' | ')}`);
  }
}
