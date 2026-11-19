// Synthetic shops shut every Saturday (F3, F4 of eval/shut-weekday.prereg.md). Output: eval/shut-weekday-sim.out.txt
//   node eval/shut-weekday-sim.mjs > eval/shut-weekday-sim.out.txt
import { replayWatch, dropShutWeekdays } from '../watch-core.mjs';

let s = 20261119 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const N = 371, FACT = [0.6, 1.2, 1, 1, 1, 1, 0]; // Sun..Sat; 2024-01-01 is a Monday
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
function shop(step) {
  const at = step ? 200 + Math.floor(rand() * 141) : null;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(rand() * (N - 7)); if ((d + 1) % 7 !== 6) shut.add(d); }
  let a = 0;
  const v = labels.map((_, i) => {
    a = 0.5 * a + 0.05 * gauss();
    const w = (i + 1) % 7; // weekday, Sunday 0
    if (w === 6 || shut.has(i)) return 0;
    const lvl = 30000 * Math.exp(a) * (at !== null && i >= at ? 1.3 : 1);
    return Math.round(lvl * FACT[w] * Math.exp(0.35 * gauss()) * (rand() < 0.03 ? 4 : 1) * 100) / 100;
  });
  return { v, at };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const tot = { D: { a: 0, c: 0, caught: 0 }, T: { a: 0, c: 0, caught: 0 } };
const sims = [...Array(100)].map(() => shop(false)).concat([...Array(100)].map(() => shop(true)));
for (const [k, { v, at }] of sims.entries()) {
  const t = dropShutWeekdays(v, labels);
  const runs = { D: replayWatch(v, labels, { model: 'mean', period: 7, from: 74 }), T: replayWatch(t.values, t.labels, { model: 'mean', period: 7 - t.dropped.length, from: 74 - Math.floor(74 / 7) }) };
  const line = [];
  for (const arm of ['D', 'T']) {
    const r = runs[arm];
    if (at === null) { tot[arm].a += r.alerts.length; tot[arm].c += r.n - r.from; line.push(`${arm} ${r.alerts.length}`); }
    else {
      const hit = r.alerts.some((x) => Math.abs(day(x.label) - day(labels[at])) <= 7 && day(x.reportedAtLabel) - day(labels[at]) <= 14 && day(x.reportedAtLabel) >= day(labels[at]));
      if (hit) tot[arm].caught++;
      line.push(`${arm} ${hit ? 'caught' : 'missed'}`);
    }
  }
  console.log(`shop ${k + 1} ${at === null ? 'no step' : 'step ' + labels[at]}: ${line.join(', ')}`);
}
const r = (x) => (100 * x.a / x.c).toFixed(2);
console.log(`\nNo step (100 shops): D ${tot.D.a} alerts in ${tot.D.c} checks (${r(tot.D)} per 100); T ${tot.T.a} in ${tot.T.c} (${r(tot.T)} per 100)`);
console.log(`+30% step (100 shops): caught D ${tot.D.caught}, T ${tot.T.caught}`);
console.log(`F3 (T false alerts <= 2 per 100 checks): ${r(tot.T)} -> ${tot.T.a / tot.T.c <= 0.02 ? 'PASS' : 'FAIL'}`);
console.log(`F4 (T catches >= 60 and >= D + 15): ${tot.T.caught} vs D ${tot.D.caught} -> ${tot.T.caught >= 60 && tot.T.caught >= tot.D.caught + 15 ? 'PASS' : 'FAIL'}`);
