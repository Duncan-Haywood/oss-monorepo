// Synthetic bars SS and SB of eval/hinge-step-or-bend-prereg-2026-11-15.md.
// usage: node eval/hinge-step-or-bend-sim.mjs [series=200] [reps=99]   (output: eval/hinge-step-or-bend-sim.out.txt)
import { hingeTest, stepOrBend } from '../hinge-test.mjs';
const N = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 99;
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
const cells = [
  { kind: 'step', size: 1, n: 100, rho: 0.5 }, { kind: 'step', size: 2, n: 100, rho: 0.5 }, { kind: 'step', size: 3, n: 100, rho: 0.5 },
  { kind: 'step', size: 2, n: 145, rho: 0.5 }, { kind: 'step', size: 2, n: 100, rho: 0 },
  { kind: 'bend', size: 0.04, n: 100, rho: 0.5 }, { kind: 'bend', size: 0.08, n: 100, rho: 0.5 },
  { kind: 'bend', size: 0.04, n: 145, rho: 0.5 }, { kind: 'bend', size: 0.08, n: 100, rho: 0 },
];
console.log(`series per cell ${N}, bootstrap replicates ${REPS}, seeds from 61,000,000; change at 60% of n, line 0.02 t, innovation sd 1`);
console.log('cell | tested | p<=0.05 (share of all) | of those, says step | says bend | right kind among rejections | bar | post hoc, not pre-registered: OLS (rho 0) right kind');
cells.forEach((c, ci) => {
  let tested = 0, rej = 0, saysStep = 0, saysBend = 0, olsRight = 0;
  for (let i = 0; i < N; i++) {
    const r = mulberry(61_000_000 + ci * 10_000 + i), k = Math.floor(0.6 * c.n), x = new Array(c.n);
    let u = gauss(r) / Math.sqrt(1 - c.rho * c.rho);
    for (let t = 0; t < c.n; t++) {
      if (t) u = c.rho * u + gauss(r);
      x[t] = 0.02 * t + u + (c.kind === 'step' ? (t > k ? c.size : 0) : c.size * Math.max(0, t - k));
    }
    const h = hingeTest(x, { reps: REPS, seed: 1 + i });
    if (h.refused) continue;
    tested++;
    if (h.p > 0.05) continue;
    rej++;
    const s = stepOrBend(x, h.rho), o = stepOrBend(x, 0);
    if (s.better === 'step') saysStep++; else saysBend++;
    if (o.better === c.kind) olsRight++;
  }
  const right = c.kind === 'step' ? saysStep : saysBend;
  const share = rej ? right / rej : NaN;
  const decides = (c.kind === 'step' && c.size >= 2) || (c.kind === 'bend' && c.size === 0.08);
  const bar = !decides ? 'reported' : rej < 30 ? `fewer than 30 rejections` : share >= 0.85 ? 'holds (>= 85%)' : 'FAILS (< 85%)';
  console.log(`${c.kind} ${c.size}, n ${c.n}, rho ${c.rho} | ${tested} | ${rej} (${(100 * rej / N).toFixed(1)}%) | ${saysStep} | ${saysBend} | ${(100 * share).toFixed(1)}% | ${bar} | ${rej ? (100 * olsRight / rej).toFixed(1) : 'NaN'}%`);
});
