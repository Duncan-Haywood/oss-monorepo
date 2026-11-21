// Round 6: a slow-climb check beside the daily watch, on calm-noise shops (eval/slow-climb.prereg.md).
// Output: eval/slow-climb-sim.out.txt
//   for p in 0 1 2 3; do node eval/slow-climb-sim.mjs $p > eval/slow-climb-sim.$p.part & done; wait
//   node eval/slow-climb-sim.mjs --combine > eval/slow-climb-sim.out.txt
// Every process draws all 600 shops from the one seed in the pre-registered order and replays every 4th (index mod 4).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { replayWatch } from '../watch-core.mjs';
import { slopeBreaks } from '../slope-breaks.mjs';
const arg = process.argv[2];

let s = 20261123 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const N = 371, FACT = [0.6, 1.2, 1, 1, 1, 1, 0]; // Sun..Sat; 2024-01-01 is a Monday
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
export function shop(size, sd, r = rand, g = gauss) {
  const a = size ? 200 + Math.floor(r() * 101) : null;
  const L = size ? 28 + Math.floor(r() * 29) : null;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(r() * (N - 7)); if ((d + 1) % 7 !== 6) shut.add(d); }
  let e = 0;
  const v = labels.map((_, i) => {
    e = 0.5 * e + 0.05 * g();
    const z = sd * g();
    const w = (i + 1) % 7;
    if (w === 6 || shut.has(i)) return 0;
    const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
    return Math.round(30000 * Math.exp(e + ramp) * FACT[w] * Math.exp(z) * 100) / 100;
  });
  return { v, a, L };
}
// Weekly totals: week k is days 7k..7k+6 (Monday to Sunday), labelled by its Monday; only whole weeks.
export function weekly(v, l) {
  const W = [], WL = [], end = [];
  for (let i = 0; i + 7 <= v.length; i += 7) { W.push(v.slice(i, i + 7).reduce((p, q) => p + q, 0)); WL.push(l[i]); end.push(l[i + 6]); }
  return { W, WL, end };
}
// The S arm: slopeBreaks on log weekly totals at the end of every week from week `from`; a new climbing knot is an alert.
export function slopeWatch(W, WL, end, { from = 30, near = 2 } = {}) {
  const y = W.map((x) => Math.log(Math.max(x, 1))), alerted = [], alerts = [];
  for (let e = from; e <= y.length; e++) {
    const { knots } = slopeBreaks(y.slice(0, e), { critical: 'auto' });
    for (const k of knots) {
      if (!(k.after > k.before)) continue;
      const wk = k.index + 1; // the first week whose total is on the new slope
      if (alerted.some((j) => Math.abs(j - wk) <= near)) continue;
      alerted.push(wk);
      alerts.push({ label: WL[wk], reportedAtLabel: end[e - 1] });
    }
  }
  return { alerts, days: (y.length - from + 1) * 7 };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
function arms(v) {
  const q = replayWatch(v, labels, { model: 'mean', period: 7, from: 74 });
  const { W, WL, end } = weekly(v, labels);
  const wk = (r) => ({ alerts: r.alerts.map((x) => ({ label: x.label, reportedAtLabel: end[WL.indexOf(x.reportedAtLabel)] })), days: (r.n - r.from) * 7 });
  return {
    Q: { alerts: q.alerts, days: q.n - q.from },
    QW: wk(replayWatch(W, WL, { model: 'mean', from: 11 })),
    DW: wk(replayWatch(W, WL, { model: 'mean', detector: 'drift', from: 11 })),
    S: slopeWatch(W, WL, end),
  };
}
const ARMS = ['Q', 'QW', 'DW', 'S'];
const SDS = [0.2, 0.36];
const groups = SDS.flatMap((sd) => [[`${sd} N`, null, sd], [`${sd} R30`, 1.3, sd], [`${sd} R90`, 1.9, sd]]);
const blank = () => ({ a: 0, d: 0, caught: 0, caught3: 0, delays: [] });
const keys = [...ARMS, ...ARMS.slice(1).map((k) => `Q+${k}`)];
const tot = Object.fromEntries(groups.map(([g]) => [g, Object.fromEntries(keys.map((k) => [k, blank()]))]));
function score(alerts, a, L) {
  const A = day(labels[a]);
  const hit = alerts.find((y) => { const d = day(y.label) - A, sent = day(y.reportedAtLabel); return d >= -7 && d <= L && sent >= A && sent <= A + L + 14; });
  const hit3 = alerts.some((y) => { const d = day(y.label) - A, sent = day(y.reportedAtLabel); return d >= -7 && d <= L && sent >= A && sent - day(y.label) <= 14; });
  return { hit, hit3, delay: hit ? day(hit.reportedAtLabel) - A : null };
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && arg === '--combine') {
  for (let p = 0; p < 4; p++) {
    const lines = readFileSync(new URL(`./slow-climb-sim.${p}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    const t = JSON.parse(lines.pop());
    for (const g in t) for (const k in t[g]) { const T = tot[g][k]; T.a += t[g][k].a; T.d += t[g][k].d; T.caught += t[g][k].caught; T.caught3 += t[g][k].caught3; T.delays.push(...t[g][k].delays); }
    console.log(lines.join('\n'));
  }
  summary();
} else if (isMain) {
  const part = Number(arg);
  let idx = 0;
  for (const [g, size, sd] of groups) {
    const shops = [...Array(100)].map(() => shop(size, sd));
    for (const [k, { v, a, L }] of shops.entries()) {
      if (idx++ % 4 !== part) continue;
      const r = arms(v), line = [];
      for (const key of keys) {
        const parts = key.startsWith('Q+') ? ['Q', key.slice(2)] : [key];
        const alerts = parts.flatMap((p) => r[p].alerts), T = tot[g][key];
        if (a === null) { T.a += alerts.length; T.d += r.Q.days; if (!key.startsWith('Q+')) line.push(`${key} ${alerts.length}`); continue; }
        if (key.startsWith('Q+')) { T.caught += parts.some((p) => score(r[p].alerts, a, L).hit) ? 1 : 0; continue; }
        const sc = score(alerts, a, L);
        if (sc.hit) { T.caught++; T.delays.push(sc.delay); }
        if (sc.hit3) T.caught3++;
        line.push(`${key} ${sc.hit ? `caught (dated ${sc.hit.label}, sent ${sc.hit.reportedAtLabel})` : 'missed'}`);
      }
      // false-alert days: each arm's own days watched
      if (a === null) for (const key of ARMS) { tot[g][key].d += r[key].days - r.Q.days; }
      console.log(`${g} shop ${k + 1}${a === null ? '' : `: climb ${labels[a]} over ${L} days`}: ${line.join(', ')}`);
    }
  }
  console.log(JSON.stringify(tot));
}
function summary() {
  const per = (x) => 100 * x.a / x.d;
  console.log('\n######## Summary ########');
  for (const sd of SDS) {
    const n = tot[`${sd} N`];
    console.log(`sd ${sd} N: ${keys.map((k) => `${k} ${n[k].a} in ${n[k].d} days (${per(n[k]).toFixed(2)} per 100)`).join('; ')}`);
    for (const z of ['R30', 'R90']) { const t = tot[`${sd} ${z}`]; console.log(`sd ${sd} ${z}: ${keys.map((k) => `${k} ${t[k].caught}${k.startsWith('Q+') ? '' : ` (round-3 rule ${t[k].caught3}, median ${median(t[k].delays) ?? '-'} days)`}`).join('; ')}`); }
  }
  // the union's days are Q's days (the daily watch runs the whole time)
  console.log('\n######## Bars ########');
  const c = (sd, z, k) => tot[`${sd} ${z}`][k].caught, fa = (sd, k) => per(tot[`${sd} N`][k]);
  const pass = {};
  for (const A of ['QW', 'DW', 'S']) {
    const g1 = c(0.36, 'R30', A) >= c(0.36, 'R30', 'Q') + 15 && fa(0.36, A) <= 1.0;
    const g2 = c(0.2, 'R30', A) >= Math.min(c(0.2, 'R30', 'Q') + 15, 90) && fa(0.2, A) <= 1.0;
    const g3 = c(0.36, 'R90', `Q+${A}`) >= c(0.36, 'R90', 'Q') + 10 && fa(0.36, `Q+${A}`) <= fa(0.36, 'Q') + 1.0;
    pass[A] = g1 && g2 && g3;
    console.log(`${A}: G1 R30 sd 0.36 ${c(0.36, 'R30', A)} vs Q ${c(0.36, 'R30', 'Q')} + 15, false ${fa(0.36, A).toFixed(2)} <= 1.0 -> ${g1 ? 'PASS' : 'FAIL'}`);
    console.log(`${A}: G2 R30 sd 0.2 ${c(0.2, 'R30', A)} vs min(Q ${c(0.2, 'R30', 'Q')} + 15, 90), false ${fa(0.2, A).toFixed(2)} <= 1.0 -> ${g2 ? 'PASS' : 'FAIL'}`);
    console.log(`${A}: G3 R90 sd 0.36 Q+${A} ${c(0.36, 'R90', `Q+${A}`)} vs Q ${c(0.36, 'R90', 'Q')} + 10, false ${fa(0.36, `Q+${A}`).toFixed(2)} <= Q ${fa(0.36, 'Q').toFixed(2)} + 1.0 -> ${g3 ? 'PASS' : 'FAIL'}`);
  }
  const ok = Object.keys(pass).filter((k) => pass[k]).sort((p, q) => c(0.36, 'R30', q) - c(0.36, 'R30', p));
  console.log(`Ships: ${ok.length ? ok[0] : 'none'}`);
}
