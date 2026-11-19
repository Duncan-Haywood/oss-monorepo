// Pre-registered: the stale-feed test (rounded-walk.mjs `staleTestMarkov`, the shipped CATCHUP test, LR
// threshold 6.56) on real prices with a known carry-forward (README "A real carried-forward feed: last-trade
// prices", 2026-11-19).
//
// Every round of the stale test so far (README "One-tick stale feeds", rounds one to five) was scored on
// simulation, and the README has asked since 2026-11-12 for "a real series with documented carry-forward to
// check a call against". A last-trade price sampled every D seconds is exactly that: a sample with no trade
// in its D seconds repeats the last trade (carried forward), and the trade times say which samples those
// are. A repeat with a trade in it is a trade at the same price, the "rounding" kind of repeat. The trade
// prints themselves, one step per trade, have no carry-forward at all: that is the real null.
//
// Data: the trade samples of the R package highfrequency (GPL >= 2, not committed; fetch with
// `python3 eval/hf-trades-fetch.py <dir>`). Primary: `sampleTDataEurope`, "trade data of one stock on one
// day in the European stock market" (33,488 trades, 2013-06-08, price about 39.5, tick 0.005). Reported, not
// judged: `sampleTData`, two days of a pseudonymised NYSE stock; its package page calls the raw sample it was
// cleaned from "imaginary", so it is not taken as real here.
//
// Windows. Prices sampled on a grid every D seconds from the first trade (the value is the last trade at or
// before the grid time), cut into consecutive non-overlapping windows of 300 steps. Europe: D = 1 every
// second window, D = 2 and D = 5 every window; trade prints (one step per trade) every second window. The
// tick is the shipped smallestStep over the whole day's series. Each window's truth: the share of its
// steps with no trade (carried). Fitted share: the Markov fit's stationary carry share
// pEnter / (1 - pStay + pEnter).
//
// The test is called directly on each window, without the shipped one-tick gate (medianMoveTicks <= 1.5):
// these prices move 2-4 ticks at the median, so the shipped pipeline never runs the test on them. The gate's
// verdict is reported per window, so what a user sees today is on record.
//
// Bars (Europe):
//   B1 power: windows with carried share >= 0.30: called stale (LR >= 6.56) in >= 80%.
//   B2 size on the real null: trade-print windows called stale in <= 10% (round four's X1/X2 bar).
//   B3 the estimate: among windows called stale, |fitted share - carried share| <= 0.10 in >= 80%.
// Reported: windows with carried share < 0.30, the one-tick gate's verdict, nu, run time; the US sample on
// the same rules (D = 1 and D = 5 every fourth window, trade prints every fourth window).
// What the bars decide: nothing in the shipped code changes either way (the gate excludes these stretches
// and the test takes about a minute a stretch at these moves, too slow for the page). Pass: the README
// records that the test separates a real carried feed from real trade prints, and the next item is opening
// the gate behind a faster fit. Fail any: the README says which bar failed and the gate stays as it is.
//
// Disclosed beforehand: while choosing the data, one window (Europe, steps 2000-2400 from the day's start)
// was run at D = 1 (LR 152, pEnter 0.50, pStay 0.59; that day's carried share 0.57) and D = 5 (LR 15.8;
// carried 0.10). Those runs chose the data set and the sampling steps, nothing else.
//
// usage: node eval/stale-real-trades.mjs <dir> > eval/stale-real-trades.out.txt
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { staleTestMarkov } from '../rounded-walk.mjs';
import { smallestStep, medianMoveTicks, ROUNDING_TICKS, CATCHUP } from '../update-rate.mjs';

export const WINDOW = 300, TAU = CATCHUP.lr;

/** Trades as [{ t: seconds, p }] from a DT,PRICE CSV, grouped by day. */
export function readTrades(text) {
  const days = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const [dt, p] = line.split(',');
    const t = Date.parse(dt.replace(' ', 'T').slice(0, 23) + 'Z') / 1000;
    const day = dt.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push({ t, p: Number(p) });
  }
  return days;
}

/** Last-trade price every D seconds and, per step, whether a trade fell in it. */
export function sampleEvery(trades, D) {
  const v = [], traded = [false];
  let j = 0;
  const t0 = trades[0].t, end = trades.at(-1).t;
  for (let g = t0, prev = -1; g <= end; g += D) {
    while (j + 1 < trades.length && trades[j + 1].t <= g) j++;
    if (v.length) traded.push(j > prev);
    v.push(trades[j].p); prev = j;
  }
  return { v, traded };
}

/** Trade prints, one step per trade (no carry-forward). */
export function tradePrints(trades) { return { v: trades.map((x) => x.p), traded: trades.map(() => true) }; }

/** Windows [from, to] of WINDOW steps; every `every`-th one. */
export function windows(n, every) {
  const out = [];
  for (let i = 0, w = 0; (i + 1) * WINDOW < n; i++) if (i % every === 0) out.push([i * WINDOW, (i + 1) * WINDOW, w++]);
  return out;
}

export function judgeWindow(v, traded, from, to, tick) {
  let carried = 0, repeats = 0;
  for (let t = from + 1; t <= to; t++) { if (!traded[t]) carried++; if (v[t] === v[t - 1]) repeats++; }
  const steps = to - from;
  const w = v.slice(from, to + 1);
  const med = medianMoveTicks(w, 1, w.length - 1, tick);
  const t0 = Date.now();
  const r = staleTestMarkov(w, 0, w.length - 1, tick);
  const sec = (Date.now() - t0) / 1000;
  const fitted = r ? r.pEnter / (1 - r.pStay + r.pEnter) : null;
  return {
    carried: carried / steps, repeats: repeats / steps, medTicks: med, gate: med != null && med <= ROUNDING_TICKS,
    lr: r ? r.lr : null, stale: !!(r && r.lr >= TAU), fitted, pEnter: r?.pEnter ?? null, pStay: r?.pStay ?? null, nu: r ? String(r.nuM) : null, sec,
  };
}

function jobsFor(file, days, plan) {
  const jobs = [];
  for (const [day, trades] of days) {
    for (const [kind, D, every] of plan) {
      const s = kind === 'prints' ? tradePrints(trades) : sampleEvery(trades, D);
      const tick = smallestStep(s.v);
      for (const [from, to, w] of windows(s.v.length, every)) jobs.push({ file, day, kind: kind === 'prints' ? 'prints' : `D=${D}`, w, from, to, tick, v: s.v.slice(from, to + 1), traded: s.traded.slice(from, to + 1) });
    }
  }
  return jobs;
}

export const PLAN_EU = [['grid', 1, 2], ['grid', 2, 1], ['grid', 5, 1], ['prints', 0, 2]];
export const PLAN_US = [['grid', 1, 4], ['grid', 5, 4], ['prints', 0, 4]];

export function tally(rows) {
  const b1 = rows.filter((r) => r.kind !== 'prints' && r.carried >= 0.3);
  const b2 = rows.filter((r) => r.kind === 'prints');
  const b3 = rows.filter((r) => r.kind !== 'prints' && r.stale);
  const share = (a, f) => (a.length ? a.filter(f).length / a.length : null);
  return {
    B1: { n: b1.length, k: b1.filter((r) => r.stale).length, share: share(b1, (r) => r.stale), pass: b1.length > 0 && share(b1, (r) => r.stale) >= 0.8 },
    B2: { n: b2.length, k: b2.filter((r) => r.stale).length, share: share(b2, (r) => r.stale), pass: b2.length > 0 && share(b2, (r) => r.stale) <= 0.1 },
    B3: { n: b3.length, k: b3.filter((r) => Math.abs(r.fitted - r.carried) <= 0.1).length, share: share(b3, (r) => Math.abs(r.fitted - r.carried) <= 0.1), pass: b3.length > 0 && share(b3, (r) => Math.abs(r.fitted - r.carried) <= 0.1) >= 0.8 },
  };
}

const f2 = (x) => (x == null ? '-' : x.toFixed(2));
function print(label, rows) {
  console.log(`\n## ${label}\n`);
  console.log('series  windows  carried (mean, range)  repeats  median move (ticks)  gate runs test  called stale (LR >= 6.56)  |fitted - carried| median  s a window');
  const groups = new Map();
  for (const r of rows) { const k = `${r.day} ${r.kind}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, g] of groups) {
    const m = (f) => g.reduce((a, r) => a + f(r), 0) / g.length;
    const errs = g.filter((r) => r.fitted != null).map((r) => Math.abs(r.fitted - r.carried)).sort((a, b) => a - b);
    const meds = g.map((r) => r.medTicks ?? 0).sort((a, b) => a - b);
    console.log(`${k}  ${g.length}  ${f2(m((r) => r.carried))} (${f2(Math.min(...g.map((r) => r.carried)))}-${f2(Math.max(...g.map((r) => r.carried)))})  ${f2(m((r) => r.repeats))}  ${f2(meds[meds.length >> 1])}  ${g.filter((r) => r.gate).length}  ${g.filter((r) => r.stale).length}  ${f2(errs[errs.length >> 1])}  ${m((r) => r.sec).toFixed(1)}`);
  }
  const t = tally(rows);
  for (const [b, x] of Object.entries(t)) console.log(`${b}: ${x.k} of ${x.n} (${f2(x.share)}) ${x.pass ? 'pass' : 'FAIL'}`);
  const low = rows.filter((r) => r.kind !== 'prints' && r.carried < 0.3);
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.2], [0.2, 0.3]]) {
    const g = low.filter((r) => r.carried >= lo && r.carried < hi);
    console.log(`reported: carried ${lo}-${hi}: ${g.filter((r) => r.stale).length} of ${g.length} called stale`);
  }
  console.log(`reported: nu of the Markov fit: ${JSON.stringify(rows.reduce((a, r) => ((a[r.nu] = (a[r.nu] || 0) + 1), a), {}))}`);
  return t;
}

async function run(jobs, threads) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { worker: true } });
    const feed = () => { if (next >= jobs.length) { wk.terminate(); resolve(); return; } const i = next++; wk.postMessage([i, jobs[i]]); };
    wk.on('message', ([i, r]) => { out[i] = r; feed(); });
    wk.on('error', reject);
    feed();
  })));
  return out;
}

if (!isMainThread && workerData && workerData.worker) {
  parentPort.on('message', ([i, j]) => {
    const r = judgeWindow(j.v, j.traded, 0, j.v.length - 1, j.tick);
    parentPort.postMessage([i, { file: j.file, day: j.day, kind: j.kind, w: j.w, from: j.from, tick: j.tick, ...r }]);
  });
} else if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'hf-data';
  const t0 = Date.now();
  const eu = jobsFor('europe', readTrades(readFileSync(join(dir, 'sampleTDataEurope.csv'), 'utf8')), PLAN_EU);
  const us = jobsFor('us', readTrades(readFileSync(join(dir, 'sampleTData.csv'), 'utf8')), PLAN_US);
  const threads = Math.max(1, Math.min(4, cpus().length));
  const rows = await run([...eu, ...us], threads);
  console.log(`# stale test on real last-trade prices (eval/stale-real-trades.mjs); window ${WINDOW} steps, tau ${TAU}, ${threads} threads`);
  const t = print('Europe (judged)', rows.filter((r) => r.file === 'europe'));
  print('US sample (reported, not judged: cleaned from a sample its package calls imaginary)', rows.filter((r) => r.file === 'us'));
  console.log(`\nverdict: ${t.B1.pass && t.B2.pass && t.B3.pass ? 'all three bars pass' : `fails ${Object.entries(t).filter(([, x]) => !x.pass).map(([b]) => b).join(', ')}`}`);
  console.log(`\nper window (file day kind window carried repeats medTicks gate lr stale fitted nu sec):`);
  for (const r of rows) console.log([r.file, r.day, r.kind, r.w, f2(r.carried), f2(r.repeats), f2(r.medTicks), r.gate ? 'gate' : '-', f2(r.lr), r.stale ? 'STALE' : '-', f2(r.fitted), r.nu, r.sec.toFixed(1)].join(' '));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
