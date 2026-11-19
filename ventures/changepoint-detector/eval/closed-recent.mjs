// A closure in the first week after a step (round 3 of closed days; eval/closed-recent.prereg.md). Output:
// eval/closed-recent.out.txt
//   node eval/closed-recent.mjs design 4 0 > d0.jsonl   (... design 4 3; round 2's fresh seeds 20261120, already seen)
//   node eval/closed-recent.mjs fresh 4 0 > f0.jsonl    (... fresh 4 3; seeds 20261121, every step series has a closure
//                                                         1 to 7 days after its step)
//   node eval/closed-recent.mjs sum design d0.jsonl d1.jsonl d2.jsonl d3.jsonl
//   node eval/closed-recent.mjs sum fresh f0.jsonl f1.jsonl f2.jsonl f3.jsonl
//   node eval/closed-recent.mjs fresh4 8 0 > g0.jsonl   (... fresh4 8 7; round 4, seeds 20261122, eval/closed-recent-r4.prereg.md)
//   node eval/closed-recent.mjs sum fresh4 g0.jsonl ... g7.jsonl
//   node eval/closed-recent.mjs real
// Arms, replayed with Quiet (bocpd, --model poisson, --period 7):
//   clean  the closed days left open (side-stream counts); off  closed days as zeros
//   fill1  the shipped fill: the nearest earlier same-weekday open day (fillClosed lags: 1)
//   rec3   the candidate: the 3 nearest earlier open days within the last week, each scaled to the closed day's weekday
//          by the weekday means of the 4 weeks ending a week before the closure (fillClosed recent: 3)
import { readFileSync } from 'node:fs';
import { replayWatch, fillClosed } from '../watch-core.mjs';

const day = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;
const iso = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function gamma(r, k) {
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function poisson(r, lam) { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal(r))); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

const N = 371, D0 = day('2024-01-01'); // a Monday; i % 7 == 5 is a Saturday
const LABELS = Array.from({ length: N }, (_, i) => iso(D0 + i));
const ARMS = ['clean', 'off', 'fill1', 'rec3'];
const openDay = (i) => i % 7 !== 5;

function series(r, side, step, closed) {
  const mu = (i) => (i % 7 === 6 ? 24 : 40) * (step != null && i >= step ? 1.4 : 1);
  const off = LABELS.map((_, i) => (i % 7 === 5 || closed.has(i) ? 0 : poisson(r, mu(i) * gamma(r, 20) / 20)));
  const clean = off.map((x, i) => (closed.has(i) ? poisson(side, mu(i) * gamma(side, 20) / 20) : x));
  return { off, clean };
}

function placebos(side, closed) { // 6 dates drawn as the closures are, none a closure: the chance rate of an alert "at a closure"
  const p = new Set();
  while (p.size < 6) { const i = 84 + Math.floor(side() * 277); if (openDay(i) && !closed.has(i) && !p.has(i)) p.add(i); }
  return [...p];
}

function run(mode, K, k) {
  const r = rng({ design: 20261120, fresh: 20261121, fresh4: 20261122 }[mode]);
  const maxGap = mode === 'design' ? 21 : 7; // fresh and fresh4: every step series has a closure 1-7 days after
  for (let s = 0; s < 200; s++) {
    let step = null; const closed = new Set();
    {
      if (s >= 100) {
        step = 150 + Math.floor(r() * 181);
        let c; do { c = step + 1 + Math.floor(r() * maxGap); } while (!openDay(c)); // a closure 1 to maxGap days after the step
        closed.add(c);
      }
      while (closed.size < 6) { const i = 84 + Math.floor(r() * 277); if (openDay(i) && !closed.has(i)) closed.add(i); }
    }
    const side = rng(1e6 + s * 7919 + ({ design: 1, fresh: 2, fresh4: 3 }[mode]));
    const { off, clean } = series(r, side, step, closed);
    const pl = placebos(side, closed);
    if (s % K !== k) continue;
    const cl = [...closed].map((i) => LABELS[i]);
    const vals = { clean, off, fill1: fillClosed(off, LABELS, cl, { period: 7, round: true, lags: 1 }).values, rec3: fillClosed(off, LABELS, cl, { period: 7, round: true, lags: 1, recent: 3 }).values };
    const row = { s, step, closed: [...closed].sort((a, b) => a - b), placebo: pl.sort((a, b) => a - b) };
    for (const arm of ARMS) {
      const rep = replayWatch(vals[arm], LABELS, { model: 'poisson', period: 7, detector: 'bocpd' });
      row[arm] = rep.alerts.map((a) => [LABELS.indexOf(String(a.label)), a.reportedAt]);
    }
    console.log(JSON.stringify(row));
  }
}

function summarise(mode, files) {
  const rows = files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)));
  if (rows.length !== 200 || new Set(rows.map((x) => x.s)).size !== 200) throw new Error(`expected 200 series, got ${rows.length}`);
  const near = (al, pts) => al.some(([i]) => pts.some((c) => Math.abs(i - c) <= 1));
  const caught = (x, arm) => x[arm].some(([i]) => Math.abs(i - x.step) <= 7);
  const delay = (x, arm) => { const a = x[arm].filter(([i]) => Math.abs(i - x.step) <= 7).map(([, t]) => t - x.step); return a.length ? Math.min(...a) : null; };
  const nul = rows.filter((x) => x.step == null), stp = rows.filter((x) => x.step != null);
  const out = (s) => console.log(s);
  out(`\n================ ${{ design: 'DESIGN: round 2 fresh seeds 20261120 (seen; deciding nothing)', fresh: 'FRESH seeds 20261121 (round 3, the pre-registered bars)', fresh4: 'FRESH seeds 20261122 (round 4, eval/closed-recent-r4.prereg.md)' }[mode]} ================`);
  out(`alerts over all 200 series: ${ARMS.map((a) => `${a} ${rows.reduce((t, x) => t + x[a].length, 0)}`).join(', ')}`);
  out(`\nno-step series (100): with an alert within 1 day of a closure / of a placebo date (chance)`);
  for (const a of ARMS) out(`  ${a.padEnd(5)}  closure ${String(nul.filter((x) => near(x[a], x.closed)).length).padStart(3)}   placebo ${String(nul.filter((x) => near(x[a], x.placebo)).length).padStart(3)}`);
  // first closure after the step, in days
  const gap = (x) => { const g = x.closed.filter((c) => c > x.step).map((c) => c - x.step); return g.length ? Math.min(...g) : null; };
  const groups = [['closure 1-2 days after the step', (g) => g != null && g <= 2], ['closure 3-7 days after', (g) => g != null && g > 2 && g <= 7], ['closure 8-21 days after', (g) => g != null && g > 7 && g <= 21], ['no closure within 21 days after', (g) => g == null || g > 21]];
  out(`\nstep series (100): steps caught (an alert dated within 7 days of the step), by the first closure after the step`);
  out(`  ${'group'.padEnd(34)} ${'n'.padStart(3)}  ${ARMS.map((a) => a.padStart(6)).join(' ')}`);
  for (const [name, f] of [...groups, ['all', () => true]]) {
    const g = stp.filter((x) => f(gap(x)));
    out(`  ${name.padEnd(34)} ${String(g.length).padStart(3)}  ${ARMS.map((a) => String(g.filter((x) => caught(x, a)).length).padStart(6)).join(' ')}`);
  }
  out(`\nstep series: caught by off only through an alert within 1 day of a closure (would not count with the closures open)`);
  out(`  ${stp.filter((x) => caught(x, 'off') && x.off.filter(([i]) => Math.abs(i - x.step) <= 7).every(([i]) => x.closed.some((c) => Math.abs(i - c) <= 1))).length} of ${stp.filter((x) => caught(x, 'off')).length}`);
  out(`\nstep series caught by clean: lost by each arm`);
  for (const a of ARMS.slice(1)) {
    const lost = stp.filter((x) => caught(x, 'clean') && !caught(x, a));
    out(`  ${a.padEnd(5)} ${String(lost.length).padStart(3)} lost${lost.length ? `; first closure after the step at ${lost.map((x) => gap(x) ?? '-').join(', ')} days` : ''}`);
  }
  out(`\nmedian days from step to the alert being sent (steps caught by both clean and the arm)`);
  for (const a of ARMS.slice(1)) {
    const both = stp.filter((x) => caught(x, 'clean') && caught(x, a));
    const med = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
    out(`  ${a.padEnd(5)} n=${both.length}: clean ${med(both.map((x) => delay(x, 'clean')))}, ${a} ${med(both.map((x) => delay(x, a)))}`);
  }
  return { rows, nul, stp, near, caught };
}

// The real shop's two years (README "Closed days filled as missing", already seen): reported, not barred. Quiet on each
// column with --period 7; closure alerts (within 1 day) and every alert, for off, fill1 and rec3.
async function real() {
  const { parseSeries } = await import('../engine.mjs');
  const dayOf = (s) => Date.parse(s + 'T00:00:00Z') / 864e5;
  for (const [name, file] of [['design year 2010-12 to 2011-12', 'online-retail-daily.csv'], ['fresh year 2009-12 to 2010-12', 'online-retail-2009-daily.csv']]) {
    const csv = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8');
    const rows = csv.trim().split('\n').slice(1).map((r) => r.split(','));
    const closed = rows.filter(([d, o, , c, nc]) => new Date(d + 'T00:00:00Z').getUTCDay() !== 6 && +o === 0 && +c === 0 && +nc === 0).map(([d]) => d);
    console.log(`\n== ${name} (${file}); ${closed.length} closed days; Quiet, --period 7 ==`);
    for (const [col, model] of [['orders', 'poisson'], ['revenue', 'mean'], ['cancellations', 'poisson'], ['new_customers', 'poisson']]) {
      const { labels, values } = parseSeries(csv, col, null);
      for (const [arm, lags, recent] of [['off', 0, 0], ['fill1', 1, 0], ['rec3', 1, 3]]) {
        const v = lags ? fillClosed(values, labels, closed, { period: 7, round: model === 'poisson', lags, recent }).values : values;
        const r = replayWatch(v, labels, { model, period: 7, detector: model === 'mean' ? undefined : 'bocpd' });
        const at = r.alerts.filter((a) => closed.some((c) => Math.abs(dayOf(c) - dayOf(String(a.label))) <= 1)).length;
        console.log(`  ${col.padEnd(13)} ${arm.padEnd(5)} ${String(r.alerts.length).padStart(2)} alerts, ${at} at a closure: ${r.alerts.map((a) => `${a.label}>${a.reportedAtLabel}`).join(' ')}`);
      }
    }
  }
}

const [part, a3, a4] = process.argv.slice(2);
if (part === 'real') await real();
if (part === 'design' || part === 'fresh' || part === 'fresh4') run(part, Number(a3 ?? 1), Number(a4 ?? 0));
if (part === 'sum') {
  const { rows, nul, stp, near, caught } = summarise(a3, process.argv.slice(4));
  if (a3 === 'fresh' || a3 === 'fresh4') {
    const c = (arm) => stp.filter((x) => caught(x, arm)).length;
    const nc = (arm) => nul.filter((x) => near(x[arm], x.closed)).length, np = (arm) => nul.filter((x) => near(x[arm], x.placebo)).length;
    const nr = (arm) => rows.reduce((t, x) => t + x[arm].length, 0);
    const t1 = nc('rec3') <= np('rec3') + 3, t2 = c('rec3') >= c('fill1') + 5, t3 = c('rec3') >= c('clean') - 5, t4 = nr('rec3') <= 1.05 * nr('fill1');
    out2(`\nBARS for rec3 (eval/closed-recent.prereg.md):`);
    out2(`  T1 closure effect gone: no-step series with an alert at a closure ${nc('rec3')} <= placebo ${np('rec3')} + 3: ${t1 ? 'PASS' : 'FAIL'}`);
    out2(`  T2 a closure in the first week after a step: caught ${c('rec3')} >= fill1 ${c('fill1')} + 5: ${t2 ? 'PASS' : 'FAIL'}`);
    out2(`  T3 near the shop that never shut: caught ${c('rec3')} >= clean ${c('clean')} - 5: ${t3 ? 'PASS' : 'FAIL'}`);
    out2(`  T4 no noisier: alerts over 200 series ${nr('rec3')} <= 1.05 x fill1 ${nr('fill1')}: ${t4 ? 'PASS' : 'FAIL'}${a3 === 'fresh4' ? ' (round 3 only; replaced by U4 in round 4)' : ''}`);
    if (a3 === 'fresh4') {
      const fa = (arm) => nul.reduce((t, x) => t + x[arm].length, 0);
      out2(`  U4 (round 4) no more false alerts than the shop that never shut: alerts on the 100 no-step series ${fa('rec3')} <= 1.05 x clean ${fa('clean')}: ${fa('rec3') <= 1.05 * fa('clean') ? 'PASS' : 'FAIL'}`);
    }
  }
}
function out2(s) { console.log(s); }
