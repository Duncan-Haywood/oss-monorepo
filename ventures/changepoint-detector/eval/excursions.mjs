// Power and false-flag rate of the `excursions` note (burst or two steps?) on seeded Poisson counts.
// Rows: no change, true bursts (2 to 4x, 5 to 10 points), a lasting step, a burst plus a persistent rise. 100 points, level 5, 100 series per row.
// Usage: node eval/excursions.mjs
import { analyze } from '../engine.mjs';
let seed = 4242;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const N = 100, RUNS = 100, LEVEL = 5;
const burst = (r, len) => (t) => (t >= 40 && t < 40 + len ? r : 1);
const rows = [
  ['no change', () => 1],
  ['5-point burst 2x', burst(2, 5)],
  ['5-point burst 3x', burst(3, 5)],
  ['10-point burst 2x', burst(2, 10)],
  ['10-point burst 3x', burst(3, 10)],
  ['10-point dip 0.3x', burst(0.3, 10)],
  ['lasting step 2x at 50', (t) => (t >= 50 ? 2 : 1)],
  ['3x burst for 5 then 1.5x for good', (t) => (t >= 45 ? 1.5 : t >= 40 ? 3 : 1)],
];
for (const [name, f] of rows) {
  let withCh = 0, flagged = 0, changes = 0;
  for (let r = 0; r < RUNS; r++) {
    const x = Array.from({ length: N }, (_, t) => pois(LEVEL * f(t)));
    const o = analyze({ values: x, model: 'poisson' });
    changes += o.pelt.changepoints.length; if (o.pelt.changepoints.length) withCh++;
    if (o.excursions && o.excursions.length) flagged++;
  }
  console.log(`${name}: series with a change ${withCh}/${RUNS}, changes/series ${(changes / RUNS).toFixed(2)}, excursion flagged ${flagged}/${RUNS}`);
}
