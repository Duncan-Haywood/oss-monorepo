// Round 5 exploratory run (eval/known-date-prereg-round5-2026-11-16.md): one pass per cell with round 4's two
// generators, keeping each series' line rho and both p-values, so that every candidate gate (use the upper bound only
// when the line rho is above g) can be scored from the same series. Seed base 21000, not reused by the confirmatory run.
// node eval/known-date-gate-explore.mjs [series] [reps]
import { knownDateTest } from '../known-date.mjs';
const S = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 199, SEED_BASE = Number(process.env.KD_SEED_BASE) || 21000;
const GATES = [0.3, 0.4, 0.5, 0.6, 0.7];
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function series(n, rho, r, { step = 0, slope = 0, k = 0, walk = false } = {}) {
  const x = []; let u = walk ? 0 : gauss(r) / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = (walk ? 1 : rho) * u + gauss(r); x.push(0.05 * t + u + (t >= k ? step + slope * (t - k) : 0)); }
  return x;
}
function cell(label, n, rho, frac, opt = {}) {
  const r = mulberry(SEED_BASE + Math.round(n * 7 + rho * 100 + frac * 10)), k = Math.round(n * frac), rows = [];
  let refused = 0;
  for (let s = 0; s < S; s++) {
    const h = knownDateTest(series(n, rho, r, { k, ...opt }), k, { reps: REPS, seed: SEED_BASE + s + 1, rhoGenMethod: 'upper' });
    if (h.refused) { refused++; continue; }
    rows.push([h.lineRho, h.pGen[0], h.pGen[1] ?? h.pGen[0]]);
  }
  const pc = (v) => (100 * v / Math.max(1, rows.length)).toFixed(1).padStart(5);
  const rej = (g) => rows.filter(([lr, pm, pu]) => (lr > g ? Math.max(pm, pu) : pm) <= 0.05).length;
  const share = (g) => rows.filter(([lr]) => lr > g).length;
  console.log(`${label.padEnd(7)} n ${String(n).padStart(3)} rho ${rho.toFixed(1)} date ${(frac * 100).toFixed(0)}% tested ${String(rows.length).padStart(3)}/${S}  matched ${pc(rej(Infinity))}  upper ${pc(rej(-Infinity))}  ` +
    GATES.map((g) => `g${g}: ${pc(rej(g))} (${pc(share(g))} gated)`).join('  '));
}
console.log(`# round 5 exploratory, seed base ${SEED_BASE}, ${S} series, ${REPS} replicates; % of tested rejected at p <= 0.05`);
for (const n of [40, 120]) for (const rho of [0, 0.4, 0.8]) for (const frac of [0.5, 0.8]) cell('null', n, rho, frac);
for (const rho of [0.8, 0.9]) cell('null', 60, rho, 0.5);
cell('null', 40, 0.9, 0.5); cell('null', 120, 0.9, 0.5);
for (const n of [40, 120]) cell('walk', n, 0, 0.5, { walk: true });
for (const n of [40, 120]) for (const rho of [0, 0.4]) { cell('step 1', n, rho, 0.5, { step: 1 }); cell('slope', n, rho, 0.5, { slope: n === 40 ? 0.05 : 0.02 }); }
