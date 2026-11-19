// Steps beside a closure: why the closed-day fill lost steps (README "Closed days filled as missing", K4b), and a
// pre-registered round on fresh seeds (eval/closed-steps.prereg.md). Output: eval/closed-steps.out.txt
//   node eval/closed-steps.mjs diag 4 0 > d0.jsonl   (... diag 4 3; the K4 seeds 20261119, all 200 series, four shards)
//   node eval/closed-steps.mjs fresh 4 0 > f0.jsonl  (... fresh 4 3; seeds 20261120, steps with a closure 1-21 days after)
//   node eval/closed-steps.mjs sum diag d0.jsonl d1.jsonl d2.jsonl d3.jsonl
//   node eval/closed-steps.mjs sum fresh f0.jsonl f1.jsonl f2.jsonl f3.jsonl
// Arms, replayed with Quiet (bocpd, --model poisson, --period 7):
//   clean  the same series with its closed days left open (their counts drawn from a side stream, so the main draws
//          are the K4 ones exactly); the change a shop would see with no closures at all
//   off    closed days left as zeros
//   fill4  closed days filled with the median of up to 4 earlier same-weekday open days (round 1's fillClosed)
//   fill1  closed days filled with the nearest earlier same-weekday open day (fillClosed lags: 1)
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
const ARMS = ['clean', 'off', 'fill4', 'fill1'];
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
  const r = rng(mode === 'diag' ? 20261119 : 20261120);
  for (let s = 0; s < 200; s++) {
    let step = null; const closed = new Set();
    if (mode === 'diag') { // the K4 draws, in K4's order
      step = s >= 100 ? 150 + Math.floor(r() * 181) : null;
      while (closed.size < 6) { const i = 84 + Math.floor(r() * 277); if ((i + 1) % 7 !== 6 && !closed.has(i)) closed.add(i); }
    } else {
      if (s >= 100) {
        step = 150 + Math.floor(r() * 181);
        let c; do { c = step + 1 + Math.floor(r() * 21); } while (!openDay(c)); // a closure 1 to 21 days after the step
        closed.add(c);
      }
      while (closed.size < 6) { const i = 84 + Math.floor(r() * 277); if (openDay(i) && !closed.has(i)) closed.add(i); }
    }
    const side = rng(1e6 + s * 7919 + (mode === 'diag' ? 0 : 1));
    const { off, clean } = series(r, side, step, closed);
    const pl = placebos(side, closed);
    if (s % K !== k) continue;
    const cl = [...closed].map((i) => LABELS[i]);
    const vals = { clean, off, fill4: fillClosed(off, LABELS, cl, { period: 7, round: true }).values, fill1: fillClosed(off, LABELS, cl, { period: 7, round: true, lags: 1 }).values };
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
  out(`\n================ ${mode === 'diag' ? 'DIAGNOSIS on the K4 seeds 20261119 (seen; deciding nothing)' : 'FRESH seeds 20261120 (the pre-registered bars)'} ================`);
  out(`alerts over all 200 series: ${ARMS.map((a) => `${a} ${rows.reduce((t, x) => t + x[a].length, 0)}`).join(', ')}`);
  out(`\nno-step series (100): with an alert within 1 day of a closure / of a placebo date (chance)`);
  for (const a of ARMS) out(`  ${a.padEnd(5)}  closure ${String(nul.filter((x) => near(x[a], x.closed)).length).padStart(3)}   placebo ${String(nul.filter((x) => near(x[a], x.placebo)).length).padStart(3)}`);
  // first closure after the step, in days
  const gap = (x) => { const g = x.closed.filter((c) => c > x.step).map((c) => c - x.step); return g.length ? Math.min(...g) : null; };
  const groups = [['closure 1-7 days after the step', (g) => g != null && g <= 7], ['closure 8-21 days after', (g) => g != null && g > 7 && g <= 21], ['no closure within 21 days after', (g) => g == null || g > 21]];
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
// column with --period 7; closure alerts (within 1 day) and every alert, for off, fill4 and fill1.
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
      for (const [arm, lags] of [['off', 0], ['fill4', 4], ['fill1', 1]]) {
        const v = lags ? fillClosed(values, labels, closed, { period: 7, round: model === 'poisson', lags }).values : values;
        const r = replayWatch(v, labels, { model, period: 7, detector: model === 'mean' ? undefined : 'bocpd' });
        const at = r.alerts.filter((a) => closed.some((c) => Math.abs(dayOf(c) - dayOf(String(a.label))) <= 1)).length;
        console.log(`  ${col.padEnd(13)} ${arm.padEnd(5)} ${String(r.alerts.length).padStart(2)} alerts, ${at} at a closure: ${r.alerts.map((a) => `${a.label}>${a.reportedAtLabel}`).join(' ')}`);
      }
    }
  }
}

const [part, a3, a4] = process.argv.slice(2);
if (part === 'real') await real();
if (part === 'diag' || part === 'fresh') run(part, Number(a3 ?? 1), Number(a4 ?? 0));
if (part === 'sum') {
  const { nul, stp, near, caught } = summarise(a3, process.argv.slice(4));
  if (a3 === 'fresh') {
    const c = (arm) => stp.filter((x) => caught(x, arm)).length;
    const nc = (arm) => nul.filter((x) => near(x[arm], x.closed)).length, np = (arm) => nul.filter((x) => near(x[arm], x.placebo)).length;
    const s1 = nc('fill1') <= np('fill1') + 3, s2 = c('fill1') >= c('clean') - 5, s3 = c('fill1') >= c('fill4');
    out2(`\nBARS for fill1 (eval/closed-steps.prereg.md):`);
    out2(`  S1 closure effect gone: no-step series with an alert at a closure ${nc('fill1')} <= placebo ${np('fill1')} + 3: ${s1 ? 'PASS' : 'FAIL'}`);
    out2(`  S2 steps beside a closure kept: caught ${c('fill1')} >= clean ${c('clean')} - 5: ${s2 ? 'PASS' : 'FAIL'}`);
    out2(`  S3 no worse than round 1's fill: caught ${c('fill1')} >= fill4 ${c('fill4')}: ${s3 ? 'PASS' : 'FAIL'}`);
    out2(`  round 1's fill on the same bars: S1 ${nc('fill4')} vs ${np('fill4')} + 3: ${nc('fill4') <= np('fill4') + 3 ? 'PASS' : 'FAIL'}; S2 ${c('fill4')} vs ${c('clean')} - 5: ${c('fill4') >= c('clean') - 5 ? 'PASS' : 'FAIL'}`);
  }
}
function out2(s) { console.log(s); }
