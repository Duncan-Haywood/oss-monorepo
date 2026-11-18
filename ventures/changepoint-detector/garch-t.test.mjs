// Student t innovations in the GARCH segment likelihood (README, "Heavy tails in the GARCH search"; pre-registered in
// eval/meanvar-tgarch-prereg-2026-11-13.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { garchSegLL, garchCuts, lgamma, GARCH_T_NUS } from './engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const t3 = (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3));

test('very large nu gives the Gaussian log-likelihood; with GARCH the t path is better converged, by under 0.3', () => {
  const r = rng(3), x = Array.from({ length: 120 }, () => 2 + gauss(r));
  assert.ok(Math.abs(garchSegLL(x, 0, 120, 0, 0, 1e8) - garchSegLL(x, 0, 120, 0, 0)) < 1e-3);
  // the shipped Gaussian path takes two scale passes and an unweighted mean; the t path's EM also weights the mean by
  // 1 / h and runs four passes, so it sits a little higher (README, "Heavy tails in the GARCH search", the bias note)
  const d = garchSegLL(x, 0, 120, 0.1, 0.85, 1e8) - garchSegLL(x, 0, 120, 0.1, 0.85);
  assert.ok(d >= 0 && d < 0.3, `difference ${d}`);
});

test('independent t: the EM passes reach the brute-force maximum over mean and scale', () => {
  const r = rng(11), x = t3(r, 150).map((v) => 3 + 2 * v), nu = 4;
  const C = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2)) + 0.5 * Math.log(2 * Math.PI);
  let best = -Infinity;
  for (let m = 2; m <= 4; m += 0.01) for (let ls = -1; ls <= 3; ls += 0.01) {
    const s2 = Math.exp(ls); let l = 0;
    for (const v of x) l += C - 0.5 * Math.log(s2) - 0.5 * (nu + 1) * Math.log1p((v - m) ** 2 / s2 / (nu - 2));
    best = Math.max(best, l);
  }
  const em = garchSegLL(x, 0, 150, 0, 0, nu);
  assert.ok(em >= best - 1e-2, `EM ${em} vs grid ${best}`);
});

test('heavy tails, no change: the Gaussian-only search cuts, the t search does not', () => {
  let k = 0, x;
  const o = (n) => ({ pen: 1.5 * Math.log(n), garchPen: 0.25 * Math.log(n), maxCuts: 4 });
  do x = t3(rng(8100 + k++), 200); while (garchCuts(x, o(200)).cuts.length === 0);
  const g = garchCuts(x, { ...o(200), tPen: 0.5 * Math.log(200) });
  assert.deepEqual(g.cuts, []);
  assert.equal(g.heavy, true);
  assert.ok(GARCH_T_NUS.includes(g.nu));
});

test('a lasting sd 1 to 3 step on t3 noise is still one cut near the step', () => {
  const x = t3(rng(77), 200).map((v, i) => (i < 100 ? 1 : 3) * v);
  const g = garchCuts(x, { pen: 1.5 * Math.log(200), garchPen: 0.25 * Math.log(200), tPen: 0.5 * Math.log(200), maxCuts: 4 });
  assert.equal(g.cuts.length, 1);
  assert.ok(Math.abs(g.cuts[0] - 100) <= 8, `cut at ${g.cuts[0]}`);
});

test('Gaussian noise with a variance step: the t paths do not win', () => {
  const r = rng(42), x = Array.from({ length: 200 }, (_, i) => (i < 100 ? 1 : 3) * gauss(r));
  const g = garchCuts(x, { pen: 1.5 * Math.log(200), garchPen: 0.25 * Math.log(200), tPen: 0.5 * Math.log(200), maxCuts: 4 });
  assert.equal(g.heavy, false);
  assert.equal(g.cuts.length, 1);
});
