// Round 8: a pulse-in-growth check (P) on weekly totals beside Q and DW (eval/growth-pulse.prereg.md, committed in
// b0e52f8ba before this script existed). Output: eval/growth-pulse-sim.out.txt
//   for p in 0 1 2 3; do node eval/growth-pulse-sim.mjs $p > eval/growth-pulse-sim.$p.part & done; wait
//   node eval/growth-pulse-sim.mjs --combine > eval/growth-pulse-sim.out.txt
// Every process calibrates c on the same 150 calibration shops (seed 20261126, P only, cheap), then draws all 450 test
// shops from seed 20261127 in the pre-registered order and replays every 4th (index mod 4) through Q and DW.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { replayWatch } from '../watch-core.mjs';
import { weekly } from './slow-climb-sim.mjs';

const N = 371;
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));

// Round 7's generator (eval/weekly-beside-sim.mjs, shop()), with the seed as a parameter.
export function generator(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const t5 = () => { const z = gauss(); let c = 0; for (let k = 0; k < 5; k++) { const g = gauss(); c += g * g; } return z / Math.sqrt(c / 5) * Math.sqrt(3 / 5); };
  return function shop(size) {
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
  };
}

const med = (x) => { const y = [...x].sort((p, q) => p - q), m = y.length >> 1; return y.length % 2 ? y[m] : (y[m - 1] + y[m]) / 2; };

// P, exactly as pre-registered. W: weekly totals; WL: their Mondays; end: their Sundays.
export function growthPulse(W, WL, end, { c, from = 24, kMin = 2, kMax = 8, minHist = 8, quiet = 8 } = {}) {
  const y = W.map((x) => Math.log(Math.max(x, 1)));
  const D = (k, t) => (y[t] + y[t - 1]) / 2 - (y[t - k] + y[t - k - 1]) / 2;
  const alerts = [], zs = [];
  let lastSent = -Infinity;
  for (let T = from; T < y.length; T++) {
    let best = 0, kBest = null;
    for (let k = kMin; k <= kMax; k++) {
      const hist = [];
      for (let t = k + 1; t <= T - 9; t++) hist.push(D(k, t));
      if (hist.length < minHist) continue;
      const m = med(hist), sc = 1.4826 * med(hist.map((h) => Math.abs(h - m)));
      if (!(sc > 0)) continue;
      const z = Math.abs((D(k, T) - m) / sc);
      if (z > best) { best = z; kBest = k; }
    }
    zs.push(best);
    if (kBest !== null && best >= c && T - lastSent > quiet) {
      lastSent = T;
      alerts.push({ label: WL[T - kBest + 1], reportedAtLabel: end[T], z: best, k: kBest });
    }
  }
  return { alerts, zs };
}

const GRID = [3, 3.5, 4, 4.5, 5, 5.5, 6];
const DAYS = N - 74; // Q's checked days a shop (replayWatch from 74)
export function calibrate() {
  const shop = generator(20261126);
  const zsByShop = [...Array(150)].map(() => { const { v } = shop(null); const { W, WL, end } = weekly(v, labels); return { W, WL, end }; });
  const rows = GRID.map((c) => {
    let n = 0;
    for (const { W, WL, end } of zsByShop) n += growthPulse(W, WL, end, { c }).alerts.length;
    return { c, n, per100: 100 * n / (150 * DAYS) };
  });
  const pick = rows.find((r) => r.per100 <= 0.10);
  return { rows, c: pick ? pick.c : null };
}

const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
function hit(alerts, a, L) {
  const A = day(labels[a]);
  return alerts.find((y) => { const d = day(y.label) - A, sent = day(y.reportedAtLabel); return d >= -7 && d <= L && sent >= A && sent <= A + 56; });
}
function arms(v, c) {
  const q = replayWatch(v, labels, { model: 'mean', period: 7, from: 74 });
  const { W, WL, end } = weekly(v, labels);
  const dw = replayWatch(W, WL, { model: 'mean', detector: 'drift', from: 11 });
  return {
    days: q.n - q.from,
    Q: q.alerts,
    DW: dw.alerts.map((x) => ({ label: x.label, reportedAtLabel: end[WL.indexOf(x.reportedAtLabel)] })),
    P: growthPulse(W, WL, end, { c }).alerts,
  };
}

const groups = [['N', null], ['R30', 1.3], ['R90', 1.9]];
const cell = () => ({ QDW: 0, QDWP: 0, P: 0, n: 0, dQDW: [], dQDWP: [] });
const tot = { N: { QDW: 0, QDWP: 0, P: 0, days: 0, lo: { QDW: 0, QDWP: 0, days: 0 }, hi: { QDW: 0, QDWP: 0, days: 0 } } };
for (const g of ['R30', 'R90']) tot[g] = { all: cell(), lo: cell(), hi: cell(), shut: cell(), open: cell() };
const arg = process.argv[2];
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && arg === '--combine') {
  const add = (T, t) => { for (const k in t) { if (Array.isArray(t[k])) T[k].push(...t[k]); else if (typeof t[k] === 'object') add(T[k], t[k]); else T[k] += t[k]; } };
  const cal = calibrate();
  console.log('######## Calibration (seed 20261126, 150 unchanged shops, P alone) ########');
  for (const r of cal.rows) console.log(`c ${r.c}: ${r.n} alerts, ${r.per100.toFixed(3)} per 100 days`);
  console.log(`c = ${cal.c ?? 'none qualifies: the round stops and fails'}\n`);
  for (let p = 0; p < 4; p++) {
    const lines = readFileSync(new URL(`./growth-pulse-sim.${p}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    add(tot, JSON.parse(lines.pop()));
    console.log(lines.join('\n'));
  }
  summary();
} else if (isMain) {
  const part = Number(arg);
  const { c } = calibrate();
  if (c === null) { console.log(JSON.stringify(tot)); process.exit(0); }
  const shop = generator(20261127);
  let idx = 0;
  for (const [g, size] of groups) {
    const shops = [...Array(150)].map(() => shop(size));
    for (const [k, { v, a, L, sd, shutDay }] of shops.entries()) {
      if (idx++ % 4 !== part) continue;
      const r = arms(v, c), half = sd < 0.3 ? 'lo' : 'hi';
      const head = `${g} shop ${k + 1} (s ${sd.toFixed(2)}, ${shutDay === null ? 'open daily' : `shut weekday ${shutDay}`})`;
      if (a === null) {
        const T = tot.N, b = r.Q.length + r.DW.length, np = r.P.length;
        T.QDW += b; T.QDWP += b + np; T.P += np; T.days += r.days; T[half].QDW += b; T[half].QDWP += b + np; T[half].days += r.days;
        console.log(`${head}: Q ${r.Q.length}, DW ${r.DW.length}, P ${np}`);
        continue;
      }
      const A = day(labels[a]);
      const hq = hit(r.Q, a, L), hd = hit(r.DW, a, L), hp = hit(r.P, a, L);
      const fb = [hq, hd].filter(Boolean).map((x) => day(x.reportedAtLabel) - A);
      const fp = [hq, hd, hp].filter(Boolean).map((x) => day(x.reportedAtLabel) - A);
      for (const t of [tot[g].all, tot[g][half], tot[g][shutDay === null ? 'open' : 'shut']]) {
        t.n++;
        if (fb.length) { t.QDW++; t.dQDW.push(Math.min(...fb)); }
        if (fp.length) { t.QDWP++; t.dQDWP.push(Math.min(...fp)); }
        if (hp) t.P++;
      }
      const w = (h) => h ? `caught (dated ${h.label}, sent ${h.reportedAtLabel})` : 'missed';
      console.log(`${head}: climb ${labels[a]} over ${L} days: Q ${w(hq)}, DW ${w(hd)}, P ${w(hp)}`);
    }
  }
  console.log(JSON.stringify(tot));
}
function summary() {
  const per = (a, d) => (100 * a / d);
  const n = tot.N;
  console.log('\n######## Summary ########');
  console.log(`N: Q+DW ${n.QDW} alerts in ${n.days} days (${per(n.QDW, n.days).toFixed(3)} per 100), Q+DW+P ${n.QDWP} (${per(n.QDWP, n.days).toFixed(3)} per 100); P alone ${n.P}`);
  for (const h of ['lo', 'hi']) console.log(`N, s ${h === 'lo' ? '< 0.30' : '>= 0.30'}: Q+DW ${per(n[h].QDW, n[h].days).toFixed(3)}, Q+DW+P ${per(n[h].QDWP, n[h].days).toFixed(3)} per 100 days`);
  for (const g of ['R30', 'R90']) for (const k of ['all', 'lo', 'hi', 'shut', 'open']) {
    const t = tot[g][k];
    console.log(`${g} ${k} (${t.n} shops): by 8 weeks Q+DW ${t.QDW}, Q+DW+P ${t.QDWP} (+${t.QDWP - t.QDW}), P alone ${t.P}; median delay Q+DW ${median(t.dQDW) ?? '-'}, Q+DW+P ${median(t.dQDWP) ?? '-'} days`);
  }
  console.log('\n######## Bars ########');
  const r = tot.R30;
  const p1 = r.all.QDWP >= r.all.QDW + 15;
  const p2 = per(n.QDWP, n.days) <= per(n.QDW, n.days) + 0.15;
  const p3 = r.lo.QDWP - r.lo.QDW >= 5 && r.hi.QDWP - r.hi.QDW >= 5;
  console.log(`P1 R30 by 8 weeks: Q+DW+P ${r.all.QDWP} vs Q+DW ${r.all.QDW} + 15 -> ${p1 ? 'PASS' : 'FAIL'}`);
  console.log(`P2 N false: Q+DW+P ${per(n.QDWP, n.days).toFixed(3)} vs Q+DW ${per(n.QDW, n.days).toFixed(3)} + 0.15 -> ${p2 ? 'PASS' : 'FAIL'}`);
  console.log(`P3 gain in each half: s < 0.30 +${r.lo.QDWP - r.lo.QDW}, s >= 0.30 +${r.hi.QDWP - r.hi.QDW} (each >= 5) -> ${p3 ? 'PASS' : 'FAIL'}`);
  console.log(`Ships a pulse check: ${p1 && p2 && p3 ? 'yes' : 'no'}`);
}
