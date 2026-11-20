// Round 3 of the shut-weekday rule: gradual climbs (eval/shut-weekday-ramp.prereg.md). Output: eval/shut-weekday-ramp-sim.out.txt
//   for g in N R30 R90; do node eval/shut-weekday-ramp-sim.mjs $g > eval/shut-weekday-ramp-sim.$g.part & done; wait
//   node eval/shut-weekday-ramp-sim.mjs --combine > eval/shut-weekday-ramp-sim.out.txt
// Each group runs in its own process (about 17 s a shop on one core); every process draws all 300 shops from the one
// seed in the pre-registered order and replays only its own group's, so the shops are those of a single run.
import { readFileSync } from 'node:fs';
import { replayWatch, dropShutWeekdays } from '../watch-core.mjs';
const only = process.argv[2];

let s = 20261120 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const N = 371, FACT = [0.6, 1.2, 1, 1, 1, 1, 0]; // Sun..Sat; 2024-01-01 is a Monday
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
function shop(size) {
  const a = size ? 200 + Math.floor(rand() * 101) : null;
  const L = size ? 28 + Math.floor(rand() * 29) : null;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(rand() * (N - 7)); if ((d + 1) % 7 !== 6) shut.add(d); }
  let e = 0;
  const v = labels.map((_, i) => {
    e = 0.5 * e + 0.05 * gauss();
    const w = (i + 1) % 7; // weekday, Sunday 0
    if (w === 6 || shut.has(i)) return 0;
    const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
    const lvl = 30000 * Math.exp(e + ramp);
    return Math.round(lvl * FACT[w] * Math.exp(0.35 * gauss()) * (rand() < 0.03 ? 4 : 1) * 100) / 100;
  });
  return { v, a, L, size };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
const ARMS = [['D', 'quiet', false], ['T', 'quiet', true], ['Dmid', 'bocpd', false], ['Tmid', 'bocpd', true]];
const groups = [['N', null], ['R30', 1.3], ['R90', 1.9]];
const tot = {};
if (only === '--combine') {
  for (const [g] of groups) {
    const lines = readFileSync(new URL(`./shut-weekday-ramp-sim.${g}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    tot[g] = JSON.parse(lines.pop());
    console.log(lines.join('\n'));
  }
} else for (const [g, size] of groups) {
  tot[g] = Object.fromEntries(ARMS.map(([k]) => [k, { a: 0, c: 0, caught: 0, delays: [] }]));
  const shops = [...Array(100)].map(() => shop(size));
  if (only && only !== g) continue;
  for (const [k, { v, a, L }] of shops.entries()) {
    const t = dropShutWeekdays(v, labels, { recent: 8 });
    const line = [];
    for (const [arm, det, drop] of ARMS) {
      const opts = { model: 'mean', ...(det === 'quiet' ? {} : { detector: det }) };
      const r = drop
        ? replayWatch(t.values, t.labels, { ...opts, period: 7 - t.dropped.length, from: 74 - Math.floor(74 / 7) })
        : replayWatch(v, labels, { ...opts, period: 7, from: 74 });
      const T0 = tot[g][arm];
      if (a === null) { T0.a += r.alerts.length; T0.c += r.n - r.from; line.push(`${arm} ${r.alerts.length}`); continue; }
      const hit = r.alerts.find((x) => { const d = day(x.label) - day(labels[a]), sent = day(x.reportedAtLabel); return d >= -7 && d <= L && sent >= day(labels[a]) && sent - day(x.label) <= 14; });
      if (hit) { T0.caught++; T0.delays.push(day(hit.reportedAtLabel) - day(labels[a])); }
      line.push(`${arm} ${hit ? `caught (dated ${hit.label}, sent ${hit.reportedAtLabel})` : 'missed'}`);
    }
    console.log(`${g} shop ${k + 1}${a === null ? '' : `: ramp ${labels[a]} over ${L} days`}: ${line.join(', ')}`);
  }
}
if (only && only !== '--combine') { console.log(JSON.stringify(tot[only])); process.exit(0); }
const per = (x) => 100 * x.a / x.c;
console.log('\n######## Summary ########');
console.log(`N (no change): ${ARMS.map(([k]) => `${k} ${tot.N[k].a} alerts in ${tot.N[k].c} checks (${per(tot.N[k]).toFixed(2)} per 100)`).join('; ')}`);
for (const g of ['R30', 'R90']) console.log(`${g}: ${ARMS.map(([k]) => `${k} caught ${tot[g][k].caught} (median ${median(tot[g][k].delays) ?? '-'} days after the ramp began)`).join('; ')}`);
const { D: d30, T: t30 } = tot.R30, { D: d90, T: t90 } = tot.R90;
console.log('\n######## Bars ########');
console.log(`P1 (D catches <= 25 of R30): ${d30.caught} -> ${d30.caught <= 25 ? 'PASS' : 'FAIL'}`);
console.log(`P2 (R90: T >= 60 and >= D + 15): T ${t90.caught}, D ${d90.caught} -> ${t90.caught >= 60 && t90.caught >= d90.caught + 15 ? 'PASS' : 'FAIL'}`);
console.log(`P3 (R30: T >= D + 10): T ${t30.caught}, D ${d30.caught} -> ${t30.caught >= d30.caught + 10 ? 'PASS' : 'FAIL'}`);
console.log(`P4 (N: T <= 2 per 100 checks): ${per(tot.N.T).toFixed(2)} -> ${per(tot.N.T) <= 2 ? 'PASS' : 'FAIL'}`);
