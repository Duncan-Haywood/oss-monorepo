import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pelt, robustSd } from './engine.mjs';

// Diagnosis of why --ar1 finds no drop on Lake Huron (README, 2026-10-28): profile the exact AR(1) likelihood
// over rho instead of trusting the difference-based estimate (0.95, the clip). Each rho gets its own PELT fit
// and innovation sd; the score is n log(sd^2) - log(1 - rho^2) + 2 log(n) per change.
const rows = readFileSync(new URL('./data/lake-huron.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), x = rows.map((r) => +r[1]), n = x.length;

function fit(rho) {
  let sigma = robustSd(x) * Math.sqrt(1 + rho), p;
  for (let it = 0; it < 4; it++) {
    p = pelt(x, { model: 'ar1mean', penalty: 'bic', minSegment: 2, sigma, rho });
    const b = [0, ...p.changepoints, n];
    const c = 1 - rho, w0 = 1 - rho * rho;
    let ss = 0;
    for (let k = 0; k + 1 < b.length; k++) {
      const s = b[k], t = b[k + 1];
      let su = 0;
      for (let i = s + 1; i < t; i++) su += x[i] - rho * x[i - 1];
      const mu = (w0 * x[s] + c * su) / (w0 + (t - s - 1) * c * c);
      ss += w0 * (x[s] - mu) ** 2;
      for (let i = s + 1; i < t; i++) ss += (x[i] - rho * x[i - 1] - c * mu) ** 2;
    }
    sigma = Math.sqrt(ss / n);
  }
  return { score: n * Math.log(sigma * sigma) - Math.log(1 - rho * rho) + 2 * p.changepoints.length * Math.log(n), cps: p.changepoints.map((i) => labels[i]) };
}

test('real Lake Huron: the profile likelihood over rho picks rho 0.8 and no change, so --ar1 is not hiding a drop the likelihood supports', () => {
  const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((rho) => ({ rho, ...fit(rho) }));
  const best = grid.reduce((a, b) => (b.score < a.score ? b : a));
  assert.equal(best.rho, 0.8);
  assert.deepEqual(best.cps, []);
  // the white-noise end of the grid is where 1923 appears
  assert.ok(fit(0).cps.includes('1923'));
  assert.ok(fit(0.3).cps.includes('1923'));
  assert.ok(!fit(0.5).cps.includes('1923'));
});
