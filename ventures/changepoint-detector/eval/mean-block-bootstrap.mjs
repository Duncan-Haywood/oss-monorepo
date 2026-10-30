// False alarms and detection of the mean model, plain vs --bootstrap, on iid and AR(1) noise (seeded, 100 series per cell).
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const gen = (seed, n, phi, jump) => { const r = rng(seed); let p = 0; const sc = Math.sqrt(1 - phi * phi); return Array.from({ length: n + 50 }, () => (p = phi * p + sc * gauss(r))).slice(50).map((v, i) => v + (i >= n / 2 ? jump : 0)); };
const N = 100;
console.log('noise, n=200 | false alarms plain / bootstrap | detection (jump 2 sd) plain / bootstrap');
for (const phi of [0, 0.3, 0.5]) {
  const c = { fa: [0, 0], det: [0, 0] };
  for (let k = 0; k < N; k++) {
    const a = gen(5000 + k, 200, phi, 0), b = gen(7000 + k, 200, phi, 2);
    [false, true].forEach((bs, j) => {
      if (analyze({ values: a, model: 'mean', bootstrap: bs }).pelt.changepoints.length) c.fa[j]++;
      const cp = analyze({ values: b, model: 'mean', bootstrap: bs }).pelt.changepoints;
      if (cp.some((q) => Math.abs(q.index - 100) <= 10)) c.det[j]++;
    });
  }
  console.log(`AR(1) ${phi} | ${c.fa[0]}% / ${c.fa[1]}% | ${c.det[0]}% / ${c.det[1]}%`);
}
