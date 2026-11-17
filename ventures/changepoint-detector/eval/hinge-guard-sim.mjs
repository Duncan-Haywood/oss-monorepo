// The two guards of hinge-test.mjs ('line', the shipped one, and 'hinge') on the same seeded synthetic series, as
// pre-registered in eval/hinge-guard-prereg-2026-11-15.md. Synthetic only.
// usage: node eval/hinge-guard-sim.mjs [series per cell=300] [bootstrap reps=99] [part=s1|s2|p|all]
import { hingeTest } from '../hinge-test.mjs';
const [N = 300, REPS = 99, PART = 'all'] = process.argv.slice(2).map((v, i) => (i < 2 ? Number(v) : v));
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// rho 1 is a random walk with drift 0.02 (sd 1 innovations, started at 0)
function series(n, rho, kneeFrac, dSlope, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const k = Math.floor(n * kneeFrac), x = []; let u = rho < 1 ? g() / Math.sqrt(1 - rho * rho) : 0;
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(0.02 * t + dSlope * Math.max(0, t - k) + u); }
  return { x, k };
}
function cell(n, rho, kf, ds, base) {
  const c = { line: { rej: 0, ref: 0 }, hinge: { rej: 0, ref: 0 } };
  for (let i = 0; i < N; i++) {
    const { x } = series(n, rho, kf, ds, base + i);
    for (const guard of ['line', 'hinge']) {
      const h = hingeTest(x, { reps: REPS, seed: i + 1, guard });
      if (h.refused) c[guard].ref++; else if (h.p <= 0.05) c[guard].rej++;
    }
  }
  const f = (o) => `${(o.rej / N * 100).toFixed(1).padStart(5)}% (${String(N - o.ref).padStart(3)} tested)`;
  return `${f(c.line)}   ${f(c.hinge)}`;
}
const out = (s) => console.log(s);
out(`series per cell ${N}, bootstrap reps ${REPS}; share of ALL series with p <= 0.05 (refused = not rejected), guard line | guard hinge`);
if (PART === 'all' || PART === 's1') {
  out('\nS1 SIZE: straight line plus AR(1) noise');
  out('n     rho    line guard               hinge guard');
  for (const n of [60, 145, 300]) for (const rho of [0, 0.3, 0.6, 0.8]) out(`${String(n).padEnd(5)} ${rho.toFixed(2)}  ${cell(n, rho, 0.5, 0, 1000 * n + 100000 * Math.round(rho * 10))}`);
}
if (PART === 'all' || PART === 's2') {
  out('\nS2 UNIT-ROOT AND NEAR-UNIT-ROOT NULLS (rho 1 = random walk with drift 0.02)');
  out('n     rho    line guard               hinge guard');
  for (const n of [60, 145, 300]) for (const rho of [0.9, 0.95, 1]) out(`${String(n).padEnd(5)} ${rho.toFixed(2)}  ${cell(n, rho, 0.5, 0, 3e6 + 1000 * n + 100000 * Math.round(rho * 100))}`);
}
if (PART === 'all' || PART === 'p') {
  out('\nP POWER at n 95, rho 0.5, slope change at 65% of the series');
  out('dSlope  line guard               hinge guard');
  for (const ds of [0.05, 0.1, 0.2]) out(`${ds.toFixed(2).padEnd(6)}  ${cell(95, 0.5, 0.65, ds, 9e6 + Math.round(ds * 1000) * 1000)}`);
}
