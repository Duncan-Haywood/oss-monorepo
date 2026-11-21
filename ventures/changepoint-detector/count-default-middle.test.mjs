import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayWatch, eagernessReplay, eagernessText, COUNT_DEFAULTS, COUNT_MIDDLE } from './watch-core.mjs';
import { labels } from './eval/gsc-sites.mjs';

// README "Middle as the count default? No" (eval/count-default-middle.prereg.md): Middle alerts on steady growth, so
// the count default stays the windowed pass. Set 3's T1 generator: base 400, weekends at 70%, gamma day multiplier
// cv 0.15, mean growing 30% over 240 days, no step.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gammaS = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const poisson = (u, l) => { let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k; };
function growing(seed) {
  const u = lcg(seed * 104729 + '1'.charCodeAt(0) * 131), k = 1 / 0.15 ** 2;
  return labels.map((d, i) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return poisson(u, 400 * (w === 0 || w === 6 ? 0.7 : 1) * (1 + 0.3 * i / 240) * gammaS(u, k, 1 / k)); });
}

test('the count default is still the windowed pass, Middle still pelt + NB', () => {
  assert.deepEqual(COUNT_DEFAULTS, { detector: 'bocpd-window', overdispersion: 'nb', threshold: 0.3 });
  assert.deepEqual(COUNT_MIDDLE, { detector: 'pelt', overdispersion: 'nb' });
});

test('on a site growing 30% with no step, Middle alerts on more of 6 seeds than the default', () => {
  let d = 0, m = 0;
  for (let seed = 701; seed <= 706; seed++) {
    const v = growing(seed);
    if (replayWatch(v, labels, { model: 'poisson', ...COUNT_DEFAULTS, from: 120, step: 1, budget: Infinity }).alerts.length) d++;
    if (replayWatch(v, labels, { model: 'poisson', ...COUNT_MIDDLE, from: 120, step: 1, budget: Infinity }).alerts.length) m++;
  }
  assert.ok(m > d, `Middle ${m} vs default ${d} of 6`);
});

test('the count hint note warns that Middle alerts on growth', () => {
  const v = growing(701).slice(0, 120);
  const text = eagernessText(eagernessReplay(v, labels.slice(0, 120), { model: 'poisson' }), { column: 'clicks' });
  assert.match(text, /growing or wandering one it alerts on the trend/);
});
