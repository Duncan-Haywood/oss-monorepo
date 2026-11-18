// Size and power of the level hinge test (hinge-test.mjs) on seeded synthetic series, against the test on
// differences (slope-breaks.mjs slopeBreakPValue). Synthetic only.
// usage: node eval/hinge-test-sim.mjs [series per cell=150] [bootstrap reps=99] [gen=line|hinge] [mode=size|power|all]
import { hingeTest } from '../hinge-test.mjs';
import { slopeBreakPValue } from '../slope-breaks.mjs';
const [N = 150, REPS = 99, GEN = 'line', MODE = 'all'] = process.argv.slice(2).map((v, i) => (i < 2 ? Number(v) : v));
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, rho, kneeFrac, dSlope, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const k = Math.floor(n * kneeFrac), x = []; let u = g() / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(0.02 * t + dSlope * Math.max(0, t - k) + u); }
  return { x, k };
}
const out = (s) => console.log(s);
out(`series per cell ${N}, bootstrap reps ${REPS}, generator rho from the ${GEN} residuals`);
if (MODE !== 'power') {
  out('\nSIZE: share with p <= 0.05 on a straight line plus AR(1) noise (sd 1 innovations); refusals counted apart');
  out('n     rho   reject  refused');
  for (const n of [60, 145, 300]) for (const rho of [0, 0.3, 0.6, 0.8]) {
    let rej = 0, ref = 0;
    for (let i = 0; i < N; i++) {
      const { x } = series(n, rho, 0.5, 0, 1000 * n + 100000 * Math.round(rho * 10) + i);
      const h = hingeTest(x, { reps: REPS, seed: i + 1, gen: GEN });
      if (h.refused) ref++; else if (h.p <= 0.05) rej++;
    }
    out(`${String(n).padEnd(5)} ${rho.toFixed(1)}   ${(rej / N * 100).toFixed(1).padStart(5)}%  ${ref}`);
  }
}
if (MODE !== 'size') {
  out('\nPOWER: one slope change at 65% of the series, AR(1) noise sd 1 innovations; share with p <= 0.05, and level test dating within 5% of n');
  out('n     rho   dSlope  levels  dated   differences');
  for (const [n, rho, ds] of [[145, 0.5, 0.02], [145, 0.5, 0.04], [145, 0.5, 0.08], [145, 0.3, 0.04], [300, 0.6, 0.02], [300, 0.6, 0.04], [60, 0.3, 0.1], [60, 0.3, 0.2]]) {
    let hl = 0, dated = 0, df = 0;
    for (let i = 0; i < N; i++) {
      const { x, k } = series(n, rho, 0.65, ds, 7e6 + 1000 * n + i);
      const h = hingeTest(x, { reps: REPS, seed: i + 1, gen: GEN });
      if (!h.refused && h.p <= 0.05) { hl++; if (Math.abs(h.index - k) <= 0.05 * n) dated++; }
      if (slopeBreakPValue(x, { reps: REPS, seed: i + 1 }).p <= 0.05) df++;
    }
    out(`${String(n).padEnd(5)} ${rho.toFixed(1)}   ${ds.toFixed(2).padEnd(6)}  ${(hl / N * 100).toFixed(0).padStart(4)}%  ${(dated / N * 100).toFixed(0).padStart(4)}%   ${(df / N * 100).toFixed(0).padStart(4)}%`);
  }
}
