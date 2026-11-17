// In-time placebos beside --known-date (README "In-time placebos"; eval/known-date-prereg-placebo-2026-11-17.md).
// node eval/known-date-placebo-sim.mjs [series per cell] [replicates]; KD_SEED_BASE sets the seeds (exploratory 81000,
// confirmatory 87000). Per cell: how often the named-date test fires (p <= 0.05), how often the placebo check warns
// (at least 2 of the tested placebo dates with p <= 0.05), and among the named-date rejections, the share warned.
import { knownDateTest, placeboCheck } from '../known-date.mjs';
const S = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 199;
const SEED_BASE = Number(process.env.KD_SEED_BASE) || 81000;
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
// AR(1) noise with innovation sd 1 about 0.05 t, plus: a step or slope change at the date k (a real change), a
// quadratic bend over the whole series (curve: its value at the end, in innovation sd), or an earlier step at
// pre-period fraction `earlyAt` (a real shock before the date, like the 1973-74 fuel crisis in the seat-belt series).
function series(n, rho, r, { k, step = 0, slope = 0, curve = 0, early = 0, earlyAt = 0.4 }) {
  const x = []; let u = gauss(r) / Math.sqrt(1 - rho * rho); const ke = Math.round(k * earlyAt);
  for (let t = 0; t < n; t++) {
    if (t) u = rho * u + gauss(r);
    x.push(0.05 * t + u + (t >= k ? step + slope * (t - k) : 0) + curve * (t / (n - 1)) ** 2 + (t >= ke ? early : 0));
  }
  return x;
}
const rows = [];
// KD_SHARD=i/m runs every m-th cell from i (cells are independent; concatenate the outputs and sort by the cell number).
const [SHARD, SHARDS] = (process.env.KD_SHARD || '0/1').split('/').map(Number);
let cellNo = 0;
function cell(label, n, rho, frac, opt = {}) {
  const no = cellNo++;
  if (no % SHARDS !== SHARD) return;
  const r = mulberry(SEED_BASE + Math.round(n * 7 + rho * 100 + frac * 10 + (opt.curve || 0) * 13 + (opt.early || 0) * 17 + (opt.step || 0) * 19));
  const k = Math.round(n * frac);
  let tested = 0, fire = 0, warn = 0, fireWarn = 0, enough = 0, any = 0, bonf = 0, fireBonf = 0;
  for (let s = 0; s < S; s++) {
    const x = series(n, rho, r, { k, ...opt });
    const h = knownDateTest(x, k, { reps: REPS, seed: SEED_BASE + s + 1, rhoGenMethod: 'gated', gateRho: 0.5 });
    if (h.refused) continue;
    tested++;
    const pc = placeboCheck(x, k, { reps: REPS, seed: SEED_BASE + 50000 + s });
    const f = h.p <= 0.05; if (f) fire++;
    if (pc.tested >= 2) enough++;
    if (pc.fired >= 1) any++;
    const ps = pc.dates.filter((d) => !d.refused).map((d) => d.p), b = ps.length > 0 && Math.min(...ps) <= 0.05 / ps.length;
    if (b) { bonf++; if (f) fireBonf++; }
    if (pc.warn) { warn++; if (f) fireWarn++; }
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '  -').padStart(5);
  rows.push({ label, n, rho, frac, ...opt, tested, fire, warn, fireWarn, enough, any, bonf, fireBonf });
  console.log(`${String(no).padStart(2)} ${label.padEnd(12)} n ${String(n).padStart(3)} rho ${rho.toFixed(1)} date ${(frac * 100).toFixed(0)}%  tested ${String(tested).padStart(3)}/${S}  named-date fires ${pc(fire, tested)}%  placebo warns ${pc(warn, tested)}% (2+ placebos tested ${pc(enough, tested)}%, any fired ${pc(any, tested)}%, min-p Bonferroni ${pc(bonf, tested)}%)  warned among fires ${fireWarn}/${fire} (Bonferroni ${fireBonf}/${fire})`);
}
if (SHARD === 0) console.log(`# in-time placebos, seed base ${SEED_BASE}, ${S} series per cell, ${REPS} replicates; rates among series the named-date test tests`);
if (SHARD === 0) console.log('## A. Straight line before the date (no change, or a real step of 2 sd at the date): placebos should stay quiet');
for (const n of [40, 60, 120, 240]) for (const rho of [0, 0.4, 0.8]) cell('null', n, rho, n === 40 ? 0.8 : 0.5);
for (const n of [120, 240]) cell('null', n, 0.4, 0.8);
cell('step 2 sd', 120, 0.4, 0.5, { step: 2 });
if (SHARD === 0) console.log('## B. A bend, no change at the date: the named-date test is fooled; placebos should warn');
for (const n of [120, 240]) for (const rho of [0, 0.4]) for (const curve of [4, 8]) cell(`curve ${curve}`, n, rho, n === 120 ? 0.8 : 0.5, { curve });
if (SHARD === 0) console.log('## C. An earlier real shock of 3 sd before the date, none at it');
for (const n of [120, 240]) for (const rho of [0, 0.4]) cell('early 3 sd', n, rho, 0.7, { early: 3 });
if (process.env.KD_JSON) console.log(JSON.stringify(rows));
