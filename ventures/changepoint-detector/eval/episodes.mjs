// Does --episodes label a true burst as one episode, and leave a lasting step or a two-step change alone?
// Seeded negative-binomial counts (size 8, level 5), 100 points, 40 series per row; usage: node eval/episodes.mjs
import { analyze } from '../engine.mjs';
let seed = 777;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * Math.pow(rnd(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { const x = gauss(), v = (1 + c * x) ** 3; if (v > 0 && Math.log(rnd()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb = (m, size = 8) => pois(gamma(size) * m / size);
const N = 100, RUNS = 40;
const rows = [
  ['no change', () => 1],
  ['5-point burst 3x at 40-44', (t) => (t >= 40 && t < 45 ? 3 : 1)],
  ['8-point burst 2.5x at 40-47', (t) => (t >= 40 && t < 48 ? 2.5 : 1)],
  ['lasting step 2x at 50', (t) => (t >= 50 ? 2 : 1)],
  ['two real steps: 3x at 40-44 then 1.8x for good', (t) => (t >= 45 ? 1.8 : t >= 40 ? 3 : 1)],
];
for (const [name, f] of rows) {
  let withCh = 0, label = 0, changes = 0;
  for (let r = 0; r < RUNS; r++) {
    const x = Array.from({ length: N }, (_, t) => nb(5 * f(t)));
    const o = analyze({ values: x, model: 'poisson', overdispersion: 'nb', episodes: true });
    changes += o.pelt.changepoints.length; if (o.pelt.changepoints.length) withCh++;
    if (o.episodes.length) label++;
  }
  console.log(`${name}: series with a change ${withCh}/${RUNS}, changes/series ${(changes / RUNS).toFixed(2)}, labelled an episode ${label}/${RUNS}`);
}
