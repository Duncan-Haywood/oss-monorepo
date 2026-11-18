// The fault, measured before the NB1 cost existed (eval/nb1-preregistration.md). usage: node eval/nb1-probe.mjs 7
import { negbinSize, countDispersion, analyze } from '../engine.mjs';
let seed = Number(process.argv[2]) || 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * rnd() ** (1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let z, v; do { z = gauss(); v = 1 + c * z; } while (v <= 0); v = v * v * v; const u = rnd(); if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (l) => { if (l > 60) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb1 = (mu, phi) => pois(gamma(mu / (phi - 1)) * (phi - 1));
const nb2 = (mu, r) => pois(gamma(r) * mu / r);
const N = 200;
for (const [name, gen] of [['NB1 phi 3', (mu) => nb1(mu, 3)], ['NB2 r 8', (mu) => nb2(mu, 8)]]) {
  for (const [lvl, f] of [['flat 20', () => 20], ['ramp 7-700', (t) => 7 * Math.exp(Math.log(100) * t / (N - 1))], ['ramp 2-200', (t) => 2 * Math.exp(Math.log(100) * t / (N - 1))]]) {
    let cNb = 0, cQ = 0, cP = 0, sizes = [], phis = [];
    for (let r = 0; r < 40; r++) {
      const x = Array.from({ length: N }, (_, t) => gen(f(t)));
      sizes.push(negbinSize(x)); phis.push(countDispersion(x));
      const tr = lvl === 'flat 20' ? {} : { trend: 'bend' };
      cNb += analyze({ values: x, model: 'poisson', ...tr, overdispersion: 'nb' }).pelt.changepoints.length;
      cQ += analyze({ values: x, model: 'poisson', ...tr, overdispersion: true }).pelt.changepoints.length;
    }
    const med = (a) => [...a].sort((u, v) => u - v)[a.length >> 1];
    console.log(`${name} ${lvl}: false changes/series nb ${(cNb / 40).toFixed(2)}, quasi ${(cQ / 40).toFixed(2)}; median size ${med(sizes).toFixed(1)}, phi ${med(phis).toFixed(2)}`);
  }
}
