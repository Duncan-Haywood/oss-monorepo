// Does an AR(2) term help on real cycles? Prewhiten with AR(2) coefficients (Yule-Walker on the residuals about the
// fitted steps, three passes, as ar1JointFit does for rho), then run mean PELT on the whitened series. Counts false
// steps on lynx and sunspots (no documented step) and finds an inserted step of 1 and 2 sd in 6 evenly placed positions.
// A step counts as found if a change lies within 3 points of it and no more than 3 steps are reported. Run: node eval/ar2-prewhiten.mjs
import { readFileSync } from 'node:fs';
import { pelt, robustSd, stepResiduals, ar1Rho } from '../engine.mjs';

const load = (f) => readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);
const white = (x, a, b) => x.map((v, t) => (t >= 2 ? v - a * x[t - 1] - b * x[t - 2] : t === 1 ? v - a * x[0] : v));

export function ar2Fit(x, { order = 2, passes = 3 } = {}) {
  let a = ar1Rho(x), b = 0, cps = [];  // seeded as ar1JointFit is: unwhitened first pass lets the steps absorb the cycle
  for (let it = 0; it < passes; it++) {
    const y = white(x, a, b);
    cps = pelt(y, { model: 'mean', penalty: 'bic', minSegment: 2, sigma: robustSd(y) }).changepoints;
    const r = stepResiduals(x, cps);
    const g = (k) => { let s = 0; for (let i = k; i < r.length; i++) s += r[i] * r[i - k]; return s / r.length; };
    const g0 = g(0), g1 = g(1), g2 = g(2);
    if (order === 1) { a = g1 / g0; b = 0; } else {
      const r1 = g1 / g0, r2 = g2 / g0, det = 1 - r1 * r1;
      a = (r1 * (1 - r2)) / det; b = (r2 - r1 * r1) / det;
    }
    // keep the filter stationary and the step gain 1 - a - b positive
    if (!(1 - a - b > 0.05)) { const s = 0.95 / (a + b); a *= s; b *= s; }
  }
  const y = white(x, a, b);
  return { changepoints: pelt(y, { model: 'mean', penalty: 'bic', minSegment: 2, sigma: robustSd(y) }).changepoints, a, b };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['lynx', 'sunspot-year']) {
    const x = load(f), n = x.length;
    const sd = Math.sqrt(x.reduce((s, v) => s + (v - x.reduce((p, q) => p + q, 0) / n) ** 2, 0) / n);
    console.log(`${f} (n=${n}, rho from differences ${ar1Rho(x).toFixed(2)})`);
    for (const order of [1, 2]) {
      const fit = ar2Fit(x, { order });
      console.log(`  AR(${order}) prewhitened: false steps ${fit.changepoints.length} (a=${fit.a.toFixed(2)}, b=${fit.b.toFixed(2)})`);
      for (const jump of [1, 2]) {
        let found = 0;
        const pos = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((q) => Math.floor(q * n));
        for (const p of pos) {
          const z = x.map((v, i) => (i >= p ? v + jump * sd : v));
          const cp = ar2Fit(z, { order }).changepoints;
          if (cp.length <= 3 && cp.some((c) => Math.abs(c - p) <= 3)) found++;
        }
        console.log(`    inserted step ${jump} sd found: ${found} of ${pos.length}`);
      }
    }
  }
}
