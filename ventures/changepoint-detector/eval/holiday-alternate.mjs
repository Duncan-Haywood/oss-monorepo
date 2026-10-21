// Weekly counts, holidays on one weekday, with one planted step: does letting the seasonal PELT pass see the holiday exposure help?
// usage: node eval/holiday-alternate.mjs
import { analyze } from '../engine.mjs';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const week = [1.3, 1.0, 1.0, 0.9, 1.1, 0.8, 0.9];
const runs = 40, n = 224;
for (const [name, opt] of [['before (no alternation)', { noHolidayAlternation: true }], ['after (alternating)', {}]]) {
  let err = 0, falseCh = 0, found = 0, ferr = 0;
  for (let s = 0; s < runs; s++) {
    const r = rng(2000 + s);
    const pois = (l) => { let u = 0; for (let i = 0; i < 12; i++) u += r(); return Math.max(0, Math.round(l + Math.sqrt(l) * (u - 6))); };
    const hol = []; for (let i = 14; i < n; i += 28) hol.push(i);
    const step = s % 2 === 1;
    const x = Array.from({ length: n }, (_, t) => pois(40 * week[t % 7] * (hol.includes(t) ? 0.3 : 1) * (step && t >= 120 ? 1.5 : 1)));
    const out = analyze({ values: x, model: 'poisson', period: 7, holidays: hol.map((h) => h + 1), ...opt });
    const cps = out.pelt.changepoints.map((c) => c.index);
    if (step) { if (cps.some((c) => Math.abs(c - 120) <= 4)) found++; falseCh += cps.filter((c) => Math.abs(c - 120) > 4).length; }
    else falseCh += cps.length;
    ferr += Math.abs(out.holidays.factor - 0.3);
    const p = out.seasonal?.profile ?? out.profile; if (p) err += Math.max(...week.map((w, i) => Math.abs(p[i] - w / (week.reduce((a, b) => a + b) / 7))));
  }
  console.log(`${name}: step found ${found}/${runs / 2}, extra changes per series ${(falseCh / runs).toFixed(2)}, holiday factor abs error ${(ferr / runs).toFixed(3)}, max seasonal-factor error ${(err / runs).toFixed(3)}`);
}
