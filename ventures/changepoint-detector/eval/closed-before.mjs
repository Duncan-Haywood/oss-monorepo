// A closure in the week before a step (eval/closed-before.prereg.md). Output: eval/closed-before.out.txt
//   node eval/closed-before.mjs fresh 4 0 > b0.jsonl   (... fresh 4 3; seeds 20261123, 100 no-step series and 300 step
//                                                        series with a closure 1 to 7 days before the step)
//   node eval/closed-before.mjs sum b0.jsonl b1.jsonl b2.jsonl b3.jsonl
//   node eval/closed-before.mjs real                   (the design year's 2011-09-01 orders alert, four ways)
// Arms, replayed with Quiet (bocpd, --model poisson, --period 7):
//   clean  the closed days left open (side-stream counts); off  closed days as zeros
//   fill1  the shipped --closed fill: the nearest earlier same-weekday open day (fillClosed lags: 1)
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
const ARMS = ['clean', 'off', 'fill1'];
const openDay = (i) => i % 7 !== 5;
const SEED = 20261123, NNULL = 100, NSTEP = 300, TOTAL = NNULL + NSTEP;

function series(r, side, step, closed) {
  const mu = (i) => (i % 7 === 6 ? 24 : 40) * (step != null && i >= step ? 1.4 : 1);
  const off = LABELS.map((_, i) => (i % 7 === 5 || closed.has(i) ? 0 : poisson(r, mu(i) * gamma(r, 20) / 20)));
  const clean = off.map((x, i) => (closed.has(i) ? poisson(side, mu(i) * gamma(side, 20) / 20) : x));
  return { off, clean };
}

function placebos(side, closed) {
  const p = new Set();
  while (p.size < 6) { const i = 84 + Math.floor(side() * 277); if (openDay(i) && !closed.has(i) && !p.has(i)) p.add(i); }
  return [...p];
}

function run(K, k) {
  const r = rng(SEED);
  for (let s = 0; s < TOTAL; s++) {
    let step = null; const closed = new Set();
    if (s >= NNULL) {
      step = 150 + Math.floor(r() * 181);
      let c; do { c = step - 1 - Math.floor(r() * 7); } while (!openDay(c)); // a closure 1 to 7 days before the step
      closed.add(c);
    }
    while (closed.size < 6) { const i = 84 + Math.floor(r() * 277); if (openDay(i) && !closed.has(i)) closed.add(i); }
    const side = rng(1e6 + s * 7919 + 4);
    const { off, clean } = series(r, side, step, closed);
    const pl = placebos(side, closed);
    if (s % K !== k) continue;
    const cl = [...closed].map((i) => LABELS[i]);
    const vals = { clean, off, fill1: fillClosed(off, LABELS, cl, { period: 7, round: true, lags: 1 }).values };
    const row = { s, step, closed: [...closed].sort((a, b) => a - b), placebo: pl.sort((a, b) => a - b) };
    for (const arm of ARMS) {
      const rep = replayWatch(vals[arm], LABELS, { model: 'poisson', period: 7, detector: 'bocpd' });
      row[arm] = rep.alerts.map((a) => [LABELS.indexOf(String(a.label)), a.reportedAt]);
    }
    console.log(JSON.stringify(row));
  }
}

function summarise(files) {
  const rows = files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)));
  if (rows.length !== TOTAL || new Set(rows.map((x) => x.s)).size !== TOTAL) throw new Error(`expected ${TOTAL} series, got ${rows.length}`);
  const out = (s) => console.log(s);
  const near = (al, pts) => al.some(([i]) => pts.some((c) => Math.abs(i - c) <= 1));
  const inWin = (x, arm) => x[arm].filter(([i]) => Math.abs(i - x.step) <= 7);
  const caught = (x, arm) => inWin(x, arm).length > 0;
  const delay = (x, arm) => Math.min(...inWin(x, arm).map(([, t]) => t - x.step));
  const med = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const nul = rows.filter((x) => x.step == null), stp = rows.filter((x) => x.step != null);
  const gapBefore = (x) => Math.min(...x.closed.filter((c) => c < x.step).map((c) => x.step - c));
  out(`================ FRESH seeds ${SEED}: ${NNULL} no-step series, ${NSTEP} step series with a closure 1-7 days before the step (eval/closed-before.prereg.md) ================`);
  out(`alerts over all ${TOTAL} series: ${ARMS.map((a) => `${a} ${rows.reduce((t, x) => t + x[a].length, 0)}`).join(', ')}`);
  out(`false alerts (no-step series): ${ARMS.map((a) => `${a} ${nul.reduce((t, x) => t + x[a].length, 0)}`).join(', ')}`);
  out(`\nno-step series (${NNULL}): with an alert within 1 day of a closure / of a placebo date (chance)`);
  for (const a of ARMS) out(`  ${a.padEnd(5)}  closure ${String(nul.filter((x) => near(x[a], x.closed)).length).padStart(3)}   placebo ${String(nul.filter((x) => near(x[a], x.placebo)).length).padStart(3)}`);
  out(`\nstep series (${NSTEP}): steps caught (an alert dated within 7 days of the step), by days from the closure to the step`);
  out(`  ${'group'.padEnd(26)} ${'n'.padStart(3)}  ${ARMS.map((a) => a.padStart(6)).join(' ')}`);
  for (const [name, f] of [['closure 1-2 days before', (g) => g <= 2], ['closure 3-4 days before', (g) => g > 2 && g <= 4], ['closure 5-7 days before', (g) => g > 4 && g <= 7], ['all', () => true]]) {
    const g = stp.filter((x) => f(gapBefore(x)));
    out(`  ${name.padEnd(26)} ${String(g.length).padStart(3)}  ${ARMS.map((a) => String(g.filter((x) => caught(x, a)).length).padStart(6)).join(' ')}`);
  }
  const viaClosure = stp.filter((x) => caught(x, 'off') && inWin(x, 'off').every(([i]) => x.closed.some((c) => Math.abs(i - c) <= 1)));
  out(`\noff: steps caught only through an alert within 1 day of a closure: ${viaClosure.length} of ${stp.filter((x) => caught(x, 'off')).length}`);
  out(`off: alert dates in the step window, relative to the step (alert day - step day), counted:`);
  const rel = new Map(); for (const x of stp) for (const [i] of inWin(x, 'off')) rel.set(i - x.step, (rel.get(i - x.step) ?? 0) + 1);
  out(`  ${[...rel.keys()].sort((p, q) => p - q).map((d) => `${d}:${rel.get(d)}`).join(' ')}`);
  out(`\npaired against clean: caught by clean and not the arm / by the arm and not clean`);
  for (const a of ARMS.slice(1)) out(`  ${a.padEnd(5)} lost ${stp.filter((x) => caught(x, 'clean') && !caught(x, a)).length}, found ${stp.filter((x) => !caught(x, 'clean') && caught(x, a)).length}`);
  out(`\nmedian days from step to the alert being sent (steps caught by both clean and the arm)`);
  const dl = {};
  for (const a of ARMS.slice(1)) {
    const both = stp.filter((x) => caught(x, 'clean') && caught(x, a));
    dl[a] = [med(both.map((x) => delay(x, 'clean'))), med(both.map((x) => delay(x, a)))];
    out(`  ${a.padEnd(5)} n=${both.length}: clean ${dl[a][0]}, ${a} ${dl[a][1]}`);
  }
  const c = (a) => stp.filter((x) => caught(x, a)).length;
  const nc = nul.filter((x) => near(x.fill1, x.closed)).length, np = nul.filter((x) => near(x.fill1, x.placebo)).length;
  out(`\nBARS (eval/closed-before.prereg.md):`);
  out(`  V1 the cost: fill1 caught ${c('fill1')} >= clean ${c('clean')} - 9: ${c('fill1') >= c('clean') - 9 ? 'PASS' : 'FAIL'}`);
  out(`  V2 no slower: fill1 median delay ${dl.fill1[1]} <= clean ${dl.fill1[0]} + 1: ${dl.fill1[1] <= dl.fill1[0] + 1 ? 'PASS' : 'FAIL'}`);
  out(`  V3 closure effect gone: fill1 no-step series with an alert at a closure ${nc} <= placebo ${np} + 3: ${nc <= np + 3 ? 'PASS' : 'FAIL'}`);
  out(`  V4 zeros lend catches: off caught ${c('off')} >= clean ${c('clean')} + 9: ${c('off') >= c('clean') + 9 ? 'PASS' : 'FAIL'}`);
}

// The design year's orders (already seen; reported, not barred): is 2011-09-01 alerted, four ways?
async function real() {
  const { parseSeries } = await import('../engine.mjs');
  const csv = readFileSync(new URL('../data/online-retail-daily.csv', import.meta.url), 'utf8');
  const rows = csv.trim().split('\n').slice(1).map((r) => r.split(','));
  const closed = rows.filter(([d, o, , c, nc]) => new Date(d + 'T00:00:00Z').getUTCDay() !== 6 && +o === 0 && +c === 0 && +nc === 0).map(([d]) => d);
  const { labels, values } = parseSeries(csv, 'orders', null);
  const H = '2011-08-29', h = labels.indexOf(H);
  console.log(`\n================ REAL: design year orders (online-retail-daily.csv), Quiet, --period 7 (seen; reported, not barred) ================`);
  console.log(`${closed.length} closed days, ${closed.includes(H) ? 'including' : 'NOT including'} ${H}. Mondays around it: ${[-14, -7, 0, 7, 14].map((d) => `${labels[h + d]} ${values[h + d]}`).join(', ')}`);
  console.log(`28-day mean of open weekdays before / after 2011-09-01: ${[[-28, 0], [0, 28]].map(([a, b]) => { const s = labels.indexOf('2011-09-01'); const xs = values.slice(s + a, s + b).filter((_, j) => new Date(labels[s + a + j] + 'T00:00:00Z').getUTCDay() !== 6 && !closed.includes(labels[s + a + j])); return (xs.reduce((p, q) => p + q, 0) / xs.length).toFixed(1); }).join(' / ')}`);
  const fill = (list) => fillClosed(values, labels, list, { period: 7, round: true, lags: 1 }).values;
  const arms = [
    ['zeros', values],
    ['fill1', fill(closed)],
    [`fill1, ${H} left zero`, fill(closed.filter((d) => d !== H))],
    [`fill1, ${H} = mean of Mondays either side`, (() => { const v = fill(closed); v[h] = Math.round((values[h - 7] + values[h + 7]) / 2); return v; })()],
  ];
  for (const [name, v] of arms) {
    const r = replayWatch(v, labels, { model: 'poisson', period: 7, detector: 'bocpd' });
    const sept = r.alerts.filter((a) => Math.abs(Date.parse(String(a.label)) - Date.parse('2011-09-01')) <= 7 * 864e5);
    console.log(`  ${name.padEnd(42)} ${String(r.alerts.length).padStart(2)} alerts; build-up (dated within 7 days of 2011-09-01): ${sept.length ? sept.map((a) => `${a.label}>${a.reportedAtLabel}`).join(' ') : 'none'}; all: ${r.alerts.map((a) => `${a.label}>${a.reportedAtLabel}`).join(' ')}`);
  }
}

const [part, a3, a4] = process.argv.slice(2);
if (part === 'real') await real();
if (part === 'fresh') run(Number(a3 ?? 1), Number(a4 ?? 0));
if (part === 'sum') summarise(process.argv.slice(3));
