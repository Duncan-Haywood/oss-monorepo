// Bars 1 to 5 of eval/nb1-preregistration.md. usage: node eval/nb1.mjs 9701 9702 9703 9704 [series per cell, default 100] [bars, default 1234 5]
// (bar 3 reads bar 1's series, so 1 runs both; the NB1 cost with --trend takes about 12 s a series, so run bars in parallel)
import { analyze, nb1Dispersion, clumpingLaw } from '../engine.mjs';
const [S1, S2, S3, S4] = [2, 3, 4, 5].map((i, j) => Number(process.argv[i]) || [9701, 9702, 9703, 9704][j]);
const R = Number(process.argv[6]) || 100, N = 200, BARS = process.argv[7] || '12345';
let seed = 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * rnd() ** (1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let z, v; do { z = gauss(); v = 1 + c * z; } while (v <= 0); v = v * v * v; const u = rnd(); if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (l) => { if (l > 60) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb1 = (mu, phi) => pois(gamma(mu / (phi - 1)) * (phi - 1));
const nb2 = (mu, r) => pois(gamma(r) * mu / r);
const RAMPS = [['ramp 7 to 700', (t) => 7 * Math.exp(Math.log(100) * t / (N - 1))], ['ramp 2 to 200', (t) => 2 * Math.exp(Math.log(100) * t / (N - 1))]];
const changes = (x, od) => analyze({ values: x, model: 'poisson', trend: 'bend', overdispersion: od }).pelt.changepoints;
const laws = (xs) => { const c = { nb1: 0, nb2: 0, either: 0 }; for (const x of xs) c[clumpingLaw(x).law]++; return c; };
// Bars 1 and 3
seed = S1;
if (BARS.includes('1')) for (const [name, f] of RAMPS) {
  const xs = Array.from({ length: R }, () => Array.from({ length: N }, (_, t) => nb1(f(t), 3)));
  let a = 0, b = 0;
  for (const x of xs) { a += changes(x, 'nb').length; b += changes(x, 'nb1').length; }
  const L = laws(xs);
  console.log(`bar 1, NB1 phi 3 ${name}: false changes per series nb ${(a / R).toFixed(2)}, nb1 ${(b / R).toFixed(2)}`);
  console.log(`bar 3, NB1 phi 3 ${name}: law nb1 ${L.nb1}, either ${L.either}, nb2 ${L.nb2} of ${R}`);
}
// Bar 2
seed = S2;
if (BARS.includes('2')) for (const [name, f] of RAMPS) {
  const xs = Array.from({ length: R }, () => Array.from({ length: N }, (_, t) => nb2(f(t), 8)));
  let a = 0, b = 0;
  for (const x of xs) { a += changes(x, 'nb').length; b += changes(x, 'nb1').length; }
  const L = laws(xs);
  console.log(`bar 2, NB2 r 8 ${name}: law nb2 ${L.nb2}, either ${L.either}, nb1 ${L.nb1} of ${R}; false changes per series nb ${(a / R).toFixed(2)}, nb1 ${(b / R).toFixed(2)} (reported, no bar)`);
}
// Bar 4
seed = S3;
if (BARS.includes('4')) {
  let a = 0, b = 0, fa = 0, fb = 0;
  for (let r = 0; r < R; r++) {
    const at = 70 + Math.floor(rnd() * 61);
    const x = Array.from({ length: N }, (_, t) => nb1(RAMPS[0][1](t) * (t >= at ? 1.6 : 1), 3));
    const ca = changes(x, 'nb'), cb = changes(x, 'nb1');
    if (ca.some((c) => Math.abs(c.index - at) <= 5)) a++;
    if (cb.some((c) => Math.abs(c.index - at) <= 5)) b++;
    fa += ca.filter((c) => Math.abs(c.index - at) > 5).length; fb += cb.filter((c) => Math.abs(c.index - at) > 5).length;
  }
  console.log(`bar 4, NB1 phi 3 ramp 7 to 700, step x1.6: found within 5 points nb ${a}, nb1 ${b} of ${R}; other changes per series nb ${(fa / R).toFixed(2)}, nb1 ${(fb / R).toFixed(2)}`);
}
// Bar 5
seed = S4;
if (BARS.includes('5')) {
const med = (a) => [...a].sort((u, v) => u - v)[a.length >> 1];
for (const [name, f] of [['flat 20', () => 20], RAMPS[0]]) {
  const ph = Array.from({ length: R }, () => nb1Dispersion(Array.from({ length: N }, (_, t) => nb1(f(t), 3))));
  console.log(`bar 5, NB1 phi 3 ${name}: median nb1Dispersion ${med(ph).toFixed(3)}`);
}
{
  const ones = Array.from({ length: R }, () => nb1Dispersion(Array.from({ length: N }, (_, t) => pois(RAMPS[0][1](t))))).filter((v) => v === 1).length;
  console.log(`bar 5, Poisson ramp 7 to 700: phi 1 on ${ones} of ${R}`);
}
}
