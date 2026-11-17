// Synthetic bars W, N, RW and U of eval/hinge-step-or-bend-boot-prereg-2026-11-15.md (fresh seeds from 62,000,000).
// usage: node eval/hinge-step-or-bend-boot-sim.mjs [series=200] [reps=199] [cell index]   (output: eval/hinge-step-or-bend-boot-sim.out.txt)
// With a cell index it prints that cell's row only (for running cells in parallel); without, all rows in order.
import { hingeTest, stepOrBendTest } from '../hinge-test.mjs';
const N = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 199, ONLY = process.argv[4];
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
export const cells = [
  { kind: 'step', size: 1, n: 100, rho: 0.5 }, { kind: 'step', size: 2, n: 100, rho: 0.5 }, { kind: 'step', size: 3, n: 100, rho: 0.5 },
  { kind: 'step', size: 2, n: 145, rho: 0.5 }, { kind: 'step', size: 2, n: 100, rho: 0 },
  { kind: 'bend', size: 0.04, n: 100, rho: 0.5 }, { kind: 'bend', size: 0.08, n: 100, rho: 0.5 },
  { kind: 'bend', size: 0.04, n: 145, rho: 0.5 }, { kind: 'bend', size: 0.08, n: 100, rho: 0 },
  { kind: 'none', size: 0, n: 100, rho: 0 }, { kind: 'none', size: 0, n: 100, rho: 0.5 }, { kind: 'none', size: 0, n: 145, rho: 0.5 },
  { kind: 'walk', size: 0, n: 100, rho: 1 }, { kind: 'walk', size: 0, n: 145, rho: 1 },
];
function series(c, r) {
  const k = Math.floor(0.6 * c.n), x = new Array(c.n);
  if (c.kind === 'walk') { let u = 0; for (let t = 0; t < c.n; t++) { if (t) u += 0.02 + gauss(r); x[t] = u; } return x; }
  let u = gauss(r) / Math.sqrt(1 - c.rho * c.rho);
  for (let t = 0; t < c.n; t++) {
    if (t) u = c.rho * u + gauss(r);
    x[t] = 0.02 * t + u + (c.kind === 'step' ? (t > k ? c.size : 0) : c.kind === 'bend' ? c.size * Math.max(0, t - k) : 0);
  }
  return x;
}
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/a');
function bar(c, tally, tested) {
  const wrong = c.kind === 'step' ? tally.bend : tally.step;
  if (c.kind === 'step' && c.size >= 2 || c.kind === 'bend' && c.size === 0.08) {
    const w = wrong / tested <= 0.08 ? 'W holds' : 'W FAILS';
    if (c.rho === 0 && c.n === 100 && (c.size === 2 || c.size === 0.08)) return `${w}; ${tally[c.kind] / tested >= 0.5 ? 'U holds' : 'U FAILS'}`;
    return w;
  }
  if (c.kind === 'none') return tally.step / tested <= 0.08 && tally.bend / tested <= 0.08 ? 'N holds' : 'N FAILS';
  if (c.kind === 'walk') return (tally.step + tally.bend) / N <= 0.1 ? 'RW holds' : 'RW FAILS';
  return 'reported';
}
const rows = ONLY === undefined ? cells.map((_, i) => i) : [Number(ONLY)];
if (ONLY === undefined) {
  console.log(`series per cell ${N}, replicates per null ${REPS}, seeds from 62,000,000; change at 60% of n, line 0.02 t, innovation sd 1`);
  console.log('cell | tested (not refused) | step | bend | unclear | right kind of tested | wrong kind of tested | bar | reported: hinge test rejects (99 reps) -> step / bend / unclear among those');
}
for (const ci of rows) {
  const c = cells[ci], tally = { step: 0, bend: 0, unclear: 0 }, sel = { n: 0, step: 0, bend: 0, unclear: 0 };
  let tested = 0;
  for (let i = 0; i < N; i++) {
    const x = series(c, mulberry(62_000_000 + ci * 10_000 + i));
    const s = stepOrBendTest(x, { reps: REPS, seed: 1 + i });
    if (s.refused) continue;
    tested++; tally[s.call]++;
    const h = hingeTest(x, { reps: 99, seed: 1 + i });
    if (!h.refused && h.p <= 0.05) { sel.n++; sel[s.call]++; }
  }
  const right = c.kind === 'step' || c.kind === 'bend' ? tally[c.kind] : null, wrong = c.kind === 'step' ? tally.bend : c.kind === 'bend' ? tally.step : null;
  const name = c.kind === 'walk' ? `random walk, drift 0.02, n ${c.n}` : c.kind === 'none' ? `no change, n ${c.n}, rho ${c.rho}` : `${c.kind} ${c.size}, n ${c.n}, rho ${c.rho}`;
  console.log(`${name} | ${tested} | ${tally.step} | ${tally.bend} | ${tally.unclear} | ${right === null ? '-' : pct(right, tested)} | ${wrong === null ? '-' : pct(wrong, tested)} | ${bar(c, tally, tested)} | ${sel.n} -> ${sel.step} / ${sel.bend} / ${sel.unclear}`);
}
