// Round 4 of the shut-weekday line: the real shop's noise and a Christmas closure (eval/shop-tails-closure.prereg.md).
// Output: eval/shop-tails-closure-sim.out.txt
//   for g in simN simR90 realN realR90; do node eval/shop-tails-closure-sim.mjs $g > eval/shop-tails-closure-sim.$g.part & done; wait
//   node eval/shop-tails-closure-sim.mjs --combine > eval/shop-tails-closure-sim.out.txt
// Each process draws all 400 shops from the one seed in the pre-registered order and replays only its own group's.
import { readFileSync } from 'node:fs';
import { replayWatch, dropShutWeekdays, fillClosed } from '../watch-core.mjs';
import { shopResiduals } from './shop-tails.mjs';
const only = process.argv[2];

let s = 20261121 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const N = 371, FACT = [0.6, 1.2, 1, 1, 1, 1, 0]; // Sun..Sat; 2024-01-01 is a Monday
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const XMAS = Array.from({ length: 11 }, (_, k) => 23 + k);
const RES = shopResiduals();
function shop(size, family) {
  const a = size ? 200 + Math.floor(rand() * 101) : null;
  const L = size ? 28 + Math.floor(rand() * 29) : null;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(rand() * (N - 7)); if ((d + 1) % 7 !== 6) shut.add(d); }
  let e = 0, blk = 5, at = 0;
  const v = labels.map((_, i) => {
    e = 0.5 * e + 0.05 * gauss();
    // draws happen every day in the same order whatever the day is, so families differ only in their noise
    let z;
    if (family === 'sim') { const g = gauss(), w4 = rand() < 0.03; z = 0.35 * g + (w4 ? Math.log(4) : 0); }
    else { if (blk >= 5) { at = Math.floor(rand() * (RES.length - 4)); blk = 0; } z = RES[at + blk++]; }
    const w = (i + 1) % 7; // weekday, Sunday 0
    if (w === 6 || shut.has(i)) return 0;
    const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
    return Math.round(30000 * Math.exp(e + ramp) * FACT[w] * Math.exp(z) * 100) / 100;
  });
  return { v, a, L, shut: [...shut] };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
const ARMS = ['D', 'X', 'K', 'XT'];
const groups = [['simN', null, 'sim'], ['simR90', 1.9, 'sim'], ['realN', null, 'real'], ['realR90', 1.9, 'real']];
const tot = {};
if (only === '--combine') {
  for (const [g] of groups) {
    const lines = readFileSync(new URL(`./shop-tails-closure-sim.${g}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    tot[g] = JSON.parse(lines.pop());
    console.log(lines.join('\n'));
  }
} else for (const [g, size, family] of groups) {
  tot[g] = Object.fromEntries(ARMS.map((k) => [k, { a: 0, c: 0, caught: 0, back: 0, delays: [] }]));
  const shops = [...Array(100)].map(() => shop(size, family));
  if (only && only !== g) continue;
  for (const [k, { v, a, L, shut }] of shops.entries()) {
    const x = v.slice(); for (const i of XMAS) x[i] = 0;
    const closed = [...new Set([...XMAS, ...shut])].map((i) => labels[i]);
    const kv = fillClosed(x, labels, closed, { period: 7, lags: 1 }).values;
    const t = dropShutWeekdays(x, labels, { recent: 8 });
    const opts = { model: 'mean', period: 7, from: 74 };
    const runs = {
      D: replayWatch(v, labels, opts),
      X: replayWatch(x, labels, opts),
      K: replayWatch(kv, labels, opts),
      XT: replayWatch(t.values, t.labels, { ...opts, period: 7 - t.dropped.length, from: 74 - Math.floor(74 / 7) }),
    };
    const line = [];
    for (const arm of ARMS) {
      const r = runs[arm], T0 = tot[g][arm];
      if (a === null) { T0.a += r.alerts.length; T0.c += r.n - r.from; line.push(`${arm} ${r.alerts.length}`); continue; }
      const A = day(labels[a]);
      const hit = r.alerts.find((y) => { const d = day(y.label) - A, sent = day(y.reportedAtLabel); return d >= -7 && d <= L && sent >= A && sent - day(y.label) <= 14; });
      const back = r.alerts.find((y) => day(y.reportedAtLabel) >= A && day(y.label) <= A - 60);
      if (hit) { T0.caught++; T0.delays.push(day(hit.reportedAtLabel) - A); }
      if (back) T0.back++;
      line.push(`${arm} ${hit ? `caught (dated ${hit.label}, sent ${hit.reportedAtLabel})` : 'missed'}${back ? ` [dated back: ${back.label}, sent ${back.reportedAtLabel}]` : ''}`);
    }
    console.log(`${g} shop ${k + 1}${a === null ? '' : `: ramp ${labels[a]} over ${L} days`}: ${line.join(', ')}`);
  }
}
if (only && only !== '--combine') { console.log(JSON.stringify(tot[only])); process.exit(0); }
const per = (x) => 100 * x.a / x.c;
console.log('\n######## Summary ########');
for (const g of ['simN', 'realN']) console.log(`${g} (no change): ${ARMS.map((k) => `${k} ${tot[g][k].a} alerts in ${tot[g][k].c} checks (${per(tot[g][k]).toFixed(2)} per 100)`).join('; ')}`);
for (const g of ['simR90', 'realR90']) console.log(`${g}: ${ARMS.map((k) => `${k} caught ${tot[g][k].caught} (median ${median(tot[g][k].delays) ?? '-'} days), dated back ${tot[g][k].back}`).join('; ')}`);
const S = tot.simR90, R = tot.realR90;
console.log('\n######## Bars ########');
console.log(`C1 (sim: X <= D - 20): X ${S.X.caught}, D ${S.D.caught} -> ${S.X.caught <= S.D.caught - 20 ? 'PASS' : 'FAIL'}`);
console.log(`C2 (real D <= sim D - 20): real D ${R.D.caught}, sim D ${S.D.caught} -> ${R.D.caught <= S.D.caught - 20 ? 'PASS' : 'FAIL'}`);
console.log(`C3 (real X <= 30): ${R.X.caught} -> ${R.X.caught <= 30 ? 'PASS' : 'FAIL'}`);
console.log(`C4 (sim: X dated back >= 10 and >= 3 x D): X ${S.X.back}, D ${S.D.back} -> ${S.X.back >= 10 && S.X.back >= 3 * S.D.back ? 'PASS' : 'FAIL'}`);
const c1 = S.X.caught <= S.D.caught - 20;
const c5 = S.K.caught >= S.X.caught + 15 && per(tot.simN.K) <= 2 && per(tot.realN.K) <= 2;
console.log(`C5 (if C1: sim K >= X + 15; N: K <= 2 per 100 in both): K ${S.K.caught}, X ${S.X.caught}; N ${per(tot.simN.K).toFixed(2)}, ${per(tot.realN.K).toFixed(2)} -> ${c1 ? (c5 ? 'PASS' : 'FAIL') : 'not reached (C1 failed)'}`);
