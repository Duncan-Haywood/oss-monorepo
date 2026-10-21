// Weekly counts with every holiday on one weekday: does holding holidays out of the seasonal fit recover their factor?
// usage: node eval/holiday-heldout.mjs [engine path]
const eng = await import(process.argv[2] ? new URL(process.argv[2], 'file://' + process.cwd() + '/') : '../engine.mjs');
const { analyze } = eng;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const week = [1.3, 1.0, 1.0, 0.9, 1.1, 0.8, 0.9];
const runs = 40, n = 224;
let errs = [], changes = 0, fac = [];
for (let s = 0; s < runs; s++) {
  const r = rng(1000 + s);
  const pois = (l) => { if (l > 30) { let u = 0; for (let i = 0; i < 12; i++) u += r(); return Math.max(0, Math.round(l + Math.sqrt(l) * (u - 6))); } const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const hol = []; for (let i = 14; i < n; i += 28) hol.push(i);   // all on phase 0 (the busy day)
  const x = Array.from({ length: n }, (_, t) => pois(40 * week[t % 7] * (hol.includes(t) ? 0.3 : 1)));
  const out = analyze({ values: x, model: 'poisson', period: 7, holidays: hol.map((h) => h + 1) });
  fac.push(out.holidays.factor); errs.push(Math.abs(out.holidays.factor - 0.3)); changes += out.pelt.changepoints.length;
}
const mean = (a) => a.reduce((p, v) => p + v, 0) / a.length;
console.log(`mean fitted factor ${mean(fac).toFixed(3)} (true 0.300), mean abs error ${mean(errs).toFixed(3)}, changes per series ${(changes / runs).toFixed(2)}`);
