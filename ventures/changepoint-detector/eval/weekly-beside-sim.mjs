// Round 7: the weekly drift watch beside the daily watch, on fresh shops (eval/weekly-beside.prereg.md, committed in b96bda767
// before this script first ran). Output: eval/weekly-beside-sim.out.txt
//   for p in 0 1 2 3; do node eval/weekly-beside-sim.mjs $p > eval/weekly-beside-sim.$p.part & done; wait
//   node eval/weekly-beside-sim.mjs --combine > eval/weekly-beside-sim.out.txt
// Every process draws all 450 shops from the one seed in the pre-registered order and replays every 4th (index mod 4).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { replayWatch } from '../watch-core.mjs';
import { weekly } from './slow-climb-sim.mjs';
const arg = process.argv[2];

let s = 20261124 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
// Student-t, 5 degrees of freedom, scaled to unit variance (variance of t5 is 5/3).
const t5 = () => { const z = gauss(); let c = 0; for (let k = 0; k < 5; k++) { const g = gauss(); c += g * g; } return z / Math.sqrt(c / 5) * Math.sqrt(3 / 5); };
const N = 371;
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
// weekday index of day i: 0 = Monday ... 6 = Sunday (2024-01-01 is a Monday)
export function shop(size) {
  const a = size ? 200 + Math.floor(rand() * 101) : null;
  const L = size ? 28 + Math.floor(rand() * 29) : null;
  const base = Math.exp(Math.log(500) + rand() * Math.log(100));
  const fact = Array.from({ length: 7 }, () => Math.exp(0.25 * gauss()));
  const shutDay = rand() < 0.5 ? Math.floor(rand() * 7) : null;
  if (shutDay !== null) fact[shutDay] = 0;
  const sd = 0.15 + rand() * 0.3;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(rand() * (N - 7)); if (d % 7 !== shutDay) shut.add(d); }
  let e = 0;
  const v = labels.map((_, i) => {
    e = 0.5 * e + 0.05 * gauss();
    const z = sd * t5();
    if (fact[i % 7] === 0 || shut.has(i)) return 0;
    const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
    return Math.round(base * Math.exp(e + ramp) * fact[i % 7] * Math.exp(z) * 100) / 100;
  });
  return { v, a, L, sd, shutDay };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
function arms(v) {
  const q = replayWatch(v, labels, { model: 'mean', period: 7, from: 74 });
  const { W, WL, end } = weekly(v, labels);
  const dw = replayWatch(W, WL, { model: 'mean', detector: 'drift', from: 11 });
  return {
    days: q.n - q.from,
    Q: q.alerts,
    DW: dw.alerts.map((x) => ({ label: x.label, reportedAtLabel: end[WL.indexOf(x.reportedAtLabel)] })),
  };
}
// by8: sent within 56 days of the climb's first day; r3: round 3's rule (sent within 14 days of the climb's end), descriptive
function hit(alerts, a, L, rule) {
  const A = day(labels[a]);
  return alerts.find((y) => {
    const d = day(y.label) - A, sent = day(y.reportedAtLabel);
    if (d < -7 || d > L || sent < A) return false;
    return rule === 'by8' ? sent <= A + 56 : sent <= A + L + 14;
  });
}
const groups = [['N', null], ['R30', 1.3], ['R90', 1.9]];
const cell = () => ({ Q: 0, QDW: 0, Q14: 0, QDW14: 0, n: 0, dQ: [], dQDW: [] });
const tot = { N: { Q: 0, QDW: 0, days: 0, lo: { Q: 0, QDW: 0, days: 0 }, hi: { Q: 0, QDW: 0, days: 0 } } };
for (const g of ['R30', 'R90']) tot[g] = { all: cell(), lo: cell(), hi: cell(), shut: cell(), open: cell() };
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && arg === '--combine') {
  const add = (T, t) => { for (const k in t) { if (Array.isArray(t[k])) T[k].push(...t[k]); else if (typeof t[k] === 'object') add(T[k], t[k]); else T[k] += t[k]; } };
  for (let p = 0; p < 4; p++) {
    const lines = readFileSync(new URL(`./weekly-beside-sim.${p}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    add(tot, JSON.parse(lines.pop()));
    console.log(lines.join('\n'));
  }
  summary();
} else if (isMain) {
  const part = Number(arg);
  let idx = 0;
  for (const [g, size] of groups) {
    const shops = [...Array(150)].map(() => shop(size));
    for (const [k, { v, a, L, sd, shutDay }] of shops.entries()) {
      if (idx++ % 4 !== part) continue;
      const r = arms(v), half = sd < 0.3 ? 'lo' : 'hi';
      const head = `${g} shop ${k + 1} (s ${sd.toFixed(2)}, ${shutDay === null ? 'open daily' : `shut weekday ${shutDay}`})`;
      if (a === null) {
        const T = tot.N, nq = r.Q.length, nd = r.DW.length;
        T.Q += nq; T.QDW += nq + nd; T.days += r.days; T[half].Q += nq; T[half].QDW += nq + nd; T[half].days += r.days;
        console.log(`${head}: Q ${nq}, DW ${nd}`);
        continue;
      }
      const A = day(labels[a]);
      const hq = hit(r.Q, a, L, 'by8'), hd = hit(r.DW, a, L, 'by8');
      const hq14 = hit(r.Q, a, L, 'r3'), hd14 = hit(r.DW, a, L, 'r3');
      const first = [hq, hd].filter(Boolean).map((x) => day(x.reportedAtLabel) - A);
      for (const c of [tot[g].all, tot[g][half], tot[g][shutDay === null ? 'open' : 'shut']]) {
        c.n++; if (hq) { c.Q++; c.dQ.push(day(hq.reportedAtLabel) - A); }
        if (hq || hd) { c.QDW++; c.dQDW.push(Math.min(...first)); }
        if (hq14) c.Q14++; if (hq14 || hd14) c.QDW14++;
      }
      const w = (h) => h ? `caught (dated ${h.label}, sent ${h.reportedAtLabel})` : 'missed';
      console.log(`${head}: climb ${labels[a]} over ${L} days: Q ${w(hq)}, DW ${w(hd)}`);
    }
  }
  console.log(JSON.stringify(tot));
}
function summary() {
  const per = (a, d) => (100 * a / d);
  const n = tot.N;
  console.log('\n######## Summary ########');
  console.log(`N: Q ${n.Q} alerts in ${n.days} days (${per(n.Q, n.days).toFixed(3)} per 100), Q+DW ${n.QDW} (${per(n.QDW, n.days).toFixed(3)} per 100)`);
  for (const h of ['lo', 'hi']) console.log(`N, s ${h === 'lo' ? '< 0.30' : '>= 0.30'}: Q ${per(n[h].Q, n[h].days).toFixed(3)}, Q+DW ${per(n[h].QDW, n[h].days).toFixed(3)} per 100 days`);
  for (const g of ['R30', 'R90']) for (const c of ['all', 'lo', 'hi', 'shut', 'open']) {
    const t = tot[g][c];
    console.log(`${g} ${c} (${t.n} shops): by 8 weeks Q ${t.Q}, Q+DW ${t.QDW} (+${t.QDW - t.Q}); median delay Q ${median(t.dQ) ?? '-'}, Q+DW ${median(t.dQDW) ?? '-'} days; round-3 rule Q ${t.Q14}, Q+DW ${t.QDW14}`);
  }
  console.log('\n######## Bars ########');
  const r = tot.R90;
  const k1 = r.all.QDW >= r.all.Q + 15;
  const k2 = per(n.QDW, n.days) <= per(n.Q, n.days) + 0.15;
  const k3 = r.lo.QDW - r.lo.Q >= 5 && r.hi.QDW - r.hi.Q >= 5;
  console.log(`K1 R90 by 8 weeks: Q+DW ${r.all.QDW} vs Q ${r.all.Q} + 15 -> ${k1 ? 'PASS' : 'FAIL'}`);
  console.log(`K2 N false: Q+DW ${per(n.QDW, n.days).toFixed(3)} vs Q ${per(n.Q, n.days).toFixed(3)} + 0.15 -> ${k2 ? 'PASS' : 'FAIL'}`);
  console.log(`K3 gain in each half: s < 0.30 +${r.lo.QDW - r.lo.Q}, s >= 0.30 +${r.hi.QDW - r.hi.Q} (each >= 5) -> ${k3 ? 'PASS' : 'FAIL'}`);
  console.log(`Ships --weekly: ${k1 && k2 && k3 ? 'yes' : 'no'}`);
}
