// Does profiling the exact AR(1) likelihood over rho beat the joint fit (difference-based start, re-estimated from residuals)?
// Simulated AR(1) noise (innovation sd 1), n = 100, 200 series per cell, seeds 1..200. Null = no change; step = a level shift
// at the midpoint of `shift` stationary sds. Prints the share of series with any change (false alarms on null) and with
// exactly one change within 5 points of the truth (detection on step), for: plain mean (white-noise cost), --ar1 (inflated
// sd), --ar1 joint, and the profile fit.
// usage: node eval/ar1-profile.mjs
import { pelt, ar1Rho, longRunSd, robustSd, ar1JointFit, ar1ProfileFit } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function sim(rho, shift, seed, n = 100) {
  const r = rng(seed), sd = 1 / Math.sqrt(1 - rho * rho);
  const x = []; let e = gauss(r) * sd;
  for (let i = 0; i < n; i++) { if (i) e = rho * e + gauss(r); x.push(e + (i >= n / 2 ? shift * sd : 0)); }
  return x;
}
const methods = {
  'white (mean)': (x) => pelt(x, { model: 'mean', penalty: 'bic', minSegment: 2, sigma: robustSd(x) }).changepoints,
  '--ar1': (x) => pelt(x, { model: 'mean', penalty: 'bic', minSegment: 2, sigma: longRunSd(robustSd(x), ar1Rho(x)) }).changepoints,
  '--ar1 joint': (x) => ar1JointFit(x).changepoints,
  'profile': (x) => ar1ProfileFit(x).changepoints,
};
for (const rho of [0, 0.5, 0.8]) for (const shift of [0, 2]) {
  const row = {};
  for (const [k] of Object.entries(methods)) row[k] = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const x = sim(rho, shift, seed);
    for (const [k, f] of Object.entries(methods)) {
      const cp = f(x);
      row[k] += shift === 0 ? (cp.length > 0 ? 1 : 0) : (cp.length === 1 && Math.abs(cp[0] - 50) <= 5 ? 1 : 0);
    }
  }
  console.log(`rho ${rho} ${shift === 0 ? 'null: false alarms' : 'step ' + shift + ' sd: exactly one near 50'} | ` + Object.entries(row).map(([k, v]) => `${k} ${(v / 2).toFixed(1)}%`).join(' | '));
}
