// Exact AR(2) profile fit (ar2ProfileFit) against the AR(1) profile fit on cyclic series. Real: lynx and yearly sunspots have no
// documented step, so every change is a false alarm. Synthetic: AR(2) cycles (period ~11) with 0 or one step of 2 and 3 marginal sd.
// Run: node eval/ar2-profile.mjs
import { readFileSync } from 'node:fs';
import { ar1ProfileFit, ar2ProfileFit } from '../engine.mjs';

const load = (f) => readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const sim = (n, f1, f2, stepAt, step) => {
  const x = new Array(n).fill(0), e = [];
  for (let t = 0; t < n + 100; t++) { const a = t > 0 ? f1 * (e[t - 1] ?? 0) : 0, b = t > 1 ? f2 * (e[t - 2] ?? 0) : 0; e[t] = a + b + gauss(); }
  const sd = Math.sqrt((1 - f2) / ((1 + f2) * ((1 - f2) ** 2 - f1 * f1)));
  for (let t = 0; t < n; t++) x[t] = e[t + 100] + (stepAt != null && t >= stepAt ? step * sd : 0);
  return x;
};
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const out = (name, x) => {
    const a1 = ar1ProfileFit(x), a2 = ar2ProfileFit(x);
    console.log(`${name.padEnd(28)} n=${x.length}  AR(1): ${a1.changepoints.length} (rho ${a1.rho})   AR(2): ${a2.changepoints.length} (phi ${a2.phi1}, ${a2.phi2})`);
  };
  for (const f of ['lynx', 'sunspot-year']) out(f, load(f));
  // trappings and counts are skewed: the usual variance-stabilising transforms
  out('lynx (log10)', load('lynx').map((v) => Math.log10(v)));
  out('sunspot-year (sqrt)', load('sunspot-year').map((v) => Math.sqrt(v)));
  const R = 40, n = 200;
  for (const [label, step] of [['no step', 0], ['step 2 sd', 2], ['step 3 sd', 3]]) {
    let h1 = 0, h2 = 0, c1 = 0, c2 = 0;
    for (let r = 0; r < R; r++) {
      const x = sim(n, 1.4, -0.7, step ? 100 : null, step);
      const a1 = ar1ProfileFit(x).changepoints, a2 = ar2ProfileFit(x).changepoints;
      c1 += a1.length; c2 += a2.length;
      if (step) { h1 += a1.some((c) => Math.abs(c - 100) <= 5); h2 += a2.some((c) => Math.abs(c - 100) <= 5); }
    }
    console.log(`AR(2) 1.4/-0.7 ${label.padEnd(10)} mean changes AR(1) ${(c1 / R).toFixed(2)}  AR(2) ${(c2 / R).toFixed(2)}` + (step ? `   step found within 5: AR(1) ${h1}/${R}  AR(2) ${h2}/${R}` : ''));
  }
}
