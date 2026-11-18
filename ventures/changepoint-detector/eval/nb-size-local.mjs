// Bars 1, 2 and 4 of eval/nb-size-local-preregistration.md. usage: node eval/nb-size-local.mjs [seed1 seed2 seed4] (round 1: 9201 9202 9203; round 2: 9501 9502 9503)
const [S1, S2, S4] = [2, 3, 4].map((i, j) => Number(process.argv[i]) || [9201, 9202, 9203][j]);
import { negbinSize, negbinSizeGlobal, analyze } from '../engine.mjs';
let seed = 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const pois = (l) => { if (l > 60) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const sd = 0.35, N = 200;
const q = (a) => { const s = [...a].sort((u, v) => u - v); return [s[Math.floor(s.length / 4)], s[s.length >> 1], s[Math.floor(3 * s.length / 4)]].map((v) => (Number.isFinite(v) ? v.toFixed(2) : 'Inf')).join(' / '); };
console.log(`true size ${(1 / (Math.exp(sd * sd) - 1)).toFixed(2)}`);
// Bar 1
seed = S1;
const flat = Array.from({ length: 100 }, () => Array.from({ length: N }, (_, t) => pois(Math.exp(2 + 0.004 * t + sd * gauss() - sd * sd / 2))));
console.log(`bar 1, clumpy bump 0: size quartiles old ${q(flat.map(negbinSizeGlobal))}, new ${q(flat.map(negbinSize))}`);
for (const bump of [0.015, 0.025, 0.04]) {
  const xs = Array.from({ length: 100 }, () => { const at = 70 + Math.floor(rnd() * 60); return Array.from({ length: N }, (_, t) => pois(Math.exp(2 + 0.004 * t + bump * Math.max(0, t - at) + sd * gauss() - sd * sd / 2))); });
  console.log(`    clumpy bump ${bump}: old ${q(xs.map(negbinSizeGlobal))}, new ${q(xs.map(negbinSize))}`);
}
// Bar 2
seed = S2;
for (const [name, f] of [['Poisson rate 10', () => 10], ['Poisson ramp 7 to 700', (t) => 7 * Math.exp(Math.log(100) * t / (N - 1))]]) {
  const xs = Array.from({ length: 100 }, () => Array.from({ length: N }, (_, t) => pois(f(t))));
  const inf = (fn) => xs.filter((x) => !Number.isFinite(fn(x))).length;
  console.log(`bar 2, ${name}: Infinity on old ${inf(negbinSizeGlobal)}/100, new ${inf(negbinSize)}/100`);
}
// Bar 4
seed = S4;
for (const g of [0.004, 0.02]) {
  let kept = 0, steps = 0;
  for (let r = 0; r < 100; r++) {
    const x = Array.from({ length: N }, (_, t) => pois(Math.exp(2 + g * t + sd * gauss() - sd * sd / 2)));
    const res = analyze({ values: x, model: 'poisson', trend: 'bend', overdispersion: 'nb' });
    if (res.trend.growthChangesAt !== undefined) kept++;
    steps += (res.pelt?.changepoints || []).length;
  }
  console.log(`bar 4, straight growth ${g}/point: bend kept ${kept}/100, changes per series ${(steps / 100).toFixed(2)}`);
}
