// Should `--model meanvar` default to a longer minimum segment than 5? The one real series (US GDP growth, README
// "A real volatility break") says yes; this checks it on seeded series with a known truth.
// Setups: (null) constant sd, N(0,1); (break) sd 2 -> 1 at the midpoint; (up) sd 1 -> 2 at the midpoint, n = 60, 100, 200.
// Per minimum segment: share of null series with any change (false alarms), and on break series the share with exactly
// one change, its median absolute error in points, and the share whose range95 holds the true index.
// usage: node eval/meanvar-min-segment.mjs [reps]   (seeded; same output every run)
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 200;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const MINS = [5, 8, 10, 12, 20];
console.log(`reps ${reps} per cell, seeded; min segments ${MINS.join(', ')}`);
for (const n of [60, 100, 200]) {
  const truth = n / 2;
  console.log(`\nn = ${n}`);
  console.log('min seg | null: any change | sd2->1: one change, median error, range holds | sd1->2: one change, median error, range holds');
  for (const m of MINS) {
    const cells = [];
    for (const [name, sd0, sd1] of [['null', 1, 1], ['down', 2, 1], ['up', 1, 2]]) {
      let any = 0, one = 0, held = 0; const err = [];
      for (let k = 0; k < reps; k++) {
        const r = rng(1000 * n + 7 * k + 13);
        const v = Array.from({ length: n }, (_, i) => gauss(r) * (i < truth ? sd0 : sd1));
        const cps = analyze({ values: v, model: 'meanvar', minSegment: m }).pelt.changepoints;
        if (cps.length) any++;
        if (cps.length === 1) { one++; err.push(Math.abs(cps[0].index - truth)); const g = cps[0].range95; if (g && g.fromIndex <= truth && truth <= g.toIndex) held++; }
      }
      cells.push(name === 'null' ? pct(any, reps) : `${pct(one, reps)}, ${med(err)}, ${one ? pct(held, one) : '-'}`);
    }
    console.log(`${String(m).padStart(7)} | ${cells.join(' | ')}`);
  }
}

// The price of a longer minimum: a true short regime. n = 100, sd 1 with an 8-point patch of sd 4 at 46..53.
// "found" = two changes, each within 3 points of 46 and 54.
console.log('\nshort true regime: 8-point patch of sd 4 inside sd 1, n = 100 (found = two changes within 3 points of 46 and 54)');
for (const m of MINS) {
  let found = 0, anyc = 0;
  for (let k = 0; k < reps; k++) {
    const r = rng(777000 + 7 * k + 13);
    const v = Array.from({ length: 100 }, (_, i) => gauss(r) * (i >= 46 && i < 54 ? 4 : 1));
    const cps = analyze({ values: v, model: 'meanvar', minSegment: m }).pelt.changepoints;
    if (cps.length) anyc++;
    if (cps.length === 2 && Math.abs(cps[0].index - 46) <= 3 && Math.abs(cps[1].index - 54) <= 3) found++;
  }
  console.log(`${String(m).padStart(7)} | found ${pct(found, reps)}, any change ${pct(anyc, reps)}`);
}
