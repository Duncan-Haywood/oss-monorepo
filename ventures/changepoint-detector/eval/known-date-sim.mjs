// Size and power of knownDateTest (eval/known-date-prereg-2026-11-16.md). node eval/known-date-sim.mjs [series] [reps]
import { knownDateTest, knownDateStatistic } from '../known-date.mjs';
const S = Number(process.argv[2]) || 400, REPS = Number(process.argv[3]) || 199;
// Round 1 (eval/known-date-sim-round1.out.txt): Kendall-corrected rho capped at the guard, seed base 1000.
// Round 2 (eval/known-date-prereg-round2-2026-11-16.md): `node eval/known-date-sim.mjs 400 199 matched`, matched rho
// capped at 0.95, fresh seed base 5000.
// Round 3 (eval/known-date-prereg-round3-2026-11-16.md): `... 400 199 cut`, round 2 plus the random-walk cut guard, seed base 9000.
// Round 4 (eval/known-date-prereg-round4-2026-11-16.md): `... 400 199 upper`, round 3 plus the upper-bound generator
// (larger p of the two), seed base 13000.
// Round 5 (eval/known-date-prereg-round5-2026-11-16.md): `... 400 199 gated`, round 4's upper bound only when the line
// rho is above the pre-registered gate, seed base 25000. KD_SEED_BASE overrides the base for exploratory runs; KD_CELLS=worst runs
// only the cells that failed before.
const MODE = process.argv[4] || 'round1', ROUND2 = MODE !== 'round1';
const SEED_BASE = Number(process.env.KD_SEED_BASE) || { round1: 1000, matched: 5000, cut: 9000, upper: 13000, gated: 25000 }[MODE];
const TEST_OPT = { round1: { rhoGenMethod: 'kendall', genCap: null, guard: 'full' }, matched: { rhoGenMethod: 'matched', genCap: 0.95, guard: 'full' }, cut: { rhoGenMethod: 'matched', genCap: 0.95, guard: 'cut' }, upper: { rhoGenMethod: 'upper', genCap: 0.95, guard: 'cut' }, gated: { rhoGenMethod: 'gated', genCap: 0.95, guard: 'cut', ...(process.env.KD_GATE ? { gateRho: Number(process.env.KD_GATE) } : {}) } }[MODE];
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function series(n, rho, r, { step = 0, slope = 0, k = 0, walk = false } = {}) {
  const x = []; let u = walk ? 0 : gauss(r) / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = (walk ? 1 : rho) * u + gauss(r); x.push(0.05 * t + u + (t >= k ? step + slope * (t - k) : 0)); }
  return x;
}
function cell(label, n, rho, frac, opt = {}) {
  const r = mulberry(SEED_BASE + Math.round(n * 7 + rho * 100 + frac * 10)), k = Math.round(n * frac);
  let boot = 0, table = 0, refused = 0, done = 0;
  for (let s = 0; s < S; s++) {
    const x = series(n, rho, r, { k, ...opt });
    const h = knownDateTest(x, k, { reps: REPS, seed: SEED_BASE + s + 1, ...TEST_OPT });
    if (h.refused) { refused++; continue; }
    done++; if (h.p <= 0.05) boot++; if (h.pTable <= 0.05) table++;
  }
  const pcAll = (v) => (100 * v / S).toFixed(1);
  const pc = (v) => (100 * v / Math.max(1, done)).toFixed(1).padStart(5);
  if (process.env.KD_JSON) console.log(JSON.stringify({ label, n, rho, frac, boot, table, refused, done, S }));
  console.log(`${label.padEnd(10)} n ${String(n).padStart(3)} rho ${rho.toFixed(1)} date ${(frac * 100).toFixed(0)}%  bootstrap ${pc(boot)}%  F table ${pc(table)}%  refused ${refused}/${S}; rejected ${pcAll(boot)}% of all`);
}
if (process.env.KD_CELLS === 'worst') {
  console.log(`# ${MODE}, worst cells only, seed base ${SEED_BASE}, ${S} series, ${REPS} replicates`);
  cell('null', 40, 0.8, 0.5); cell('null', 40, 0.8, 0.8); cell('null', 60, 0.8, 0.5); cell('null', 40, 0.4, 0.8); cell('null', 60, 0.9, 0.5); cell('walk', 40, 0, 0.5, { walk: true });
  cell('step 1', 40, 0.4, 0.5, { step: 1 }); cell('step 1', 120, 0.4, 0.5, { step: 1 });
  process.exit(0);
}
console.log(`# ${MODE === 'gated' ? `round 5, round 4's upper bound gated on the line rho (gate ${TEST_OPT.gateRho ?? 'default'})` : MODE === 'upper' ? 'round 4, round 3 plus an upper-bound rho generator (larger p)' : MODE === 'cut' ? 'round 3, matched rho capped at 0.95, random-walk cut guard' : ROUND2 ? 'round 2, matched rho capped at 0.95' : 'round 1, Kendall rho capped at the guard'}; ${S} series per cell, ${REPS} bootstrap replicates; rejections at p <= 0.05 among tested series`);
console.log('## Size (null: line + AR(1))');
for (const n of [40, 120]) for (const rho of [0, 0.4, 0.8]) for (const frac of [0.5, 0.8]) cell('null', n, rho, frac);
console.log('## Power (step of 1 innovation sd; slope change 0.05 per step at n 40, 0.02 at n 120)');
for (const n of [40, 120]) for (const rho of [0, 0.4, 0.8]) { cell('step 1', n, rho, 0.5, { step: 1 }); cell('slope', n, rho, 0.5, { slope: n === 40 ? 0.05 : 0.02 }); }
console.log('## Random walks (should mostly be refused)');
for (const n of [40, 120]) cell('walk', n, 0, 0.5, { walk: true });
if (ROUND2) { console.log('## Round 2 extra: n 60 and near-unit roots'); for (const rho of [0.8, 0.9]) cell('null', 60, rho, 0.5); cell('null', 120, 0.9, 0.5); cell('null', 40, 0.9, 0.5); }
