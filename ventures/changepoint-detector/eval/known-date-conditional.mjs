// Round 6 (README "Round 6"; exploratory, then replicated on fresh seed base 45000): the bootstrap conditioned on the cut guard, scored only on the
// series the cut lets through. Screens up to SCREEN series per cell (a 1-replicate call reads the guard), keeps the
// first CAP the cut admits, and runs round 5's test (`gated`) and round 6's (`gated` + cutConditional) on each.
// node eval/known-date-conditional.mjs [screen] [cap] [reps]; KD_SEED_BASE sets the seeds (exploratory 41000).
import { knownDateTest } from '../known-date.mjs';
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const SCREEN = Number(process.argv[2]) || 3000, CAP = Number(process.argv[3]) || 60, REPS = Number(process.argv[4]) || 199;
const BASE = Number(process.env.KD_SEED_BASE) || 41000;
const OPT = { rhoGenMethod: 'gated', genCap: 0.95, guard: 'cut' };
const COND = { cutConditional: process.env.KD_COND === 'sticky' ? 'sticky' : true, ...(process.env.KD_WALKGEN ? { cutWalkGen: true } : {}) };
function series(n, rho, r, k, step, walk) {
  const x = []; let u = walk ? 0 : gauss(r) / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = (walk ? 1 : rho) * u + gauss(r); x.push(0.05 * t + u + (t >= k ? step : 0)); }
  return x;
}
const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '-').padStart(5);
const tot = { null: [0, 0, 0, 0], step: [0, 0, 0, 0] };
function cell(kind, n, rho, frac, step = 0, walk = false) {
  const r = mulberry(BASE + Math.round(n * 7 + rho * 100 + frac * 10 + step * 1000 + (walk ? 500 : 0))), k = Math.round(n * frac);
  let screened = 0, admitted = 0, old = 0, neu = 0, uncal = 0;
  for (let s = 0; s < SCREEN && admitted < CAP; s++) {
    const x = series(n, rho, r, k, step, walk); screened++;
    const g = knownDateTest(x, k, { reps: 1, seed: BASE + s + 1, ...OPT });
    if (g.refused || !g.admittedByCut) continue;
    admitted++;
    const a = knownDateTest(x, k, { reps: REPS, seed: BASE + s + 1, ...OPT });
    const b = knownDateTest(x, k, { reps: REPS, seed: BASE + s + 1, ...OPT, ...COND });
    if (a.p <= 0.05) old++;
    if (!b.calibratedConditional) uncal++;
    if (b.p <= 0.05) neu++;
  }
  const t = tot[kind === 'null' || kind === 'walk' ? 'null' : 'step']; t[0] += admitted; t[1] += old; t[2] += neu; t[3] += uncal;
  if (process.env.KD_JSON) console.log(JSON.stringify({ kind, n, rho, frac, step, walk, screened, admitted, old, neu, uncal }));
  console.log(`${kind.padEnd(6)} n ${String(n).padStart(3)} rho ${rho.toFixed(2)} date ${Math.round(frac * 100)}%${step ? ` step ${step}` : ''}: cut admitted ${admitted} of ${screened}; p <= 0.05 round 5 ${pc(old, admitted)}%, conditional ${pc(neu, admitted)}%; under ${99} admitted replicates: ${uncal}`);
}
console.log(`# round 6${COND.cutWalkGen ? ' (with the walk generator)' : ''}, seed base ${BASE}, screen ${SCREEN}, cap ${CAP}, ${REPS} replicates; only series the cut admits are scored`);
console.log('## Size (null: line + AR(1), and random walks)');
if (process.env.KD_CELLS === 'few') { cell('null', 60, 0.9, 0.5); cell('walk', 60, 0, 0.5, 0, true); cell('step', 60, 0.9, 0.5, 4); cell('step', 120, 0.9, 0.5, 4); process.exit(0); }
for (const [n, rho, frac] of [[40, 0.9, 0.5], [60, 0.8, 0.5], [60, 0.9, 0.5], [60, 0.95, 0.5], [120, 0.9, 0.5], [120, 0.95, 0.5], [60, 0.9, 0.8]]) cell('null', n, rho, frac);
for (const n of [40, 60, 120]) cell('walk', n, 0, 0.5, 0, true);
console.log('## Power (step in innovation sds at the date)');
for (const [n, rho, step] of [[60, 0.9, 2], [60, 0.9, 4], [120, 0.9, 2], [120, 0.9, 4], [40, 0.8, 3]]) cell('step', n, rho, 0.5, step);
console.log(`all null and walk: ${tot.null[0]} admitted; round 5 rejected ${pc(tot.null[1], tot.null[0])}%, conditional ${pc(tot.null[2], tot.null[0])}%, uncalibrated ${tot.null[3]}`);
console.log(`all step: ${tot.step[0]} admitted; round 5 rejected ${pc(tot.step[1], tot.step[0])}%, conditional ${pc(tot.step[2], tot.step[0])}%, uncalibrated ${tot.step[3]}`);
