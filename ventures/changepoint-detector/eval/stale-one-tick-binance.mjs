// Pre-registered (README "The shipped one-tick stale test on real one-tick feeds", 2026-11-19): the shipped
// stale test (rounded-walk.mjs `staleTestMarkov`, CATCHUP.lr 6.56) behind the shipped one-tick gate (median
// move <= ROUNDING_TICKS = 1.5 ticks), on real one-tick trade data with a known carry-forward.
//
// Why. Rounds one to five of the stale test ("One-tick stale feeds") were scored on simulation only. The one
// real carried feed so far (highfrequency's European stock, README "A real carried-forward feed") moves 2-4
// ticks, so the gate never ran the test on it. The quoted-tick round just before this one
// (eval/stale-growth-quoted-tick.mjs) found that all twelve Binance pairs move one quoted tick at the median:
// real one-tick feeds, the regime the shipped route serves. This is its first real check.
//
// Data: the same files as eval/stale-growth-quoted-tick.mjs (Binance spot trades, 2026-11-02, twelve USDT
// pairs; `node eval/binance-fetch.mjs <dir>`, not committed); tick = the quoted tick. Series per symbol: the
// trade prints (the real null) and the last-trade price every D = 0.5, 1, 2 and 5 s (sampleEvery). Windows:
// consecutive non-overlapping 300-step windows; of each series' windows, PER evenly spaced ones are taken
// (index floor(i * n / PER), i = 0..PER-1; all of them when n <= PER), to bound the run time.
// Each window's truth: its share of steps with no print. Fitted share: pEnter / (1 - pStay + pEnter).
//
// Scored where the shipped pipeline runs the test: windows the one-tick gate passes (medianMoveTicks <= 1.5
// in the quoted tick). Bars, pooled over symbols:
//   T1 power: gated grid windows with carried share >= 0.30 called stale in >= 80% (n >= 10).
//   T2 size on the real null: gated print windows called stale in <= 10% (n >= 10).
//   T3 the estimate: gated grid windows called stale with |fitted - carried| <= 0.10 in >= 80% (n >= 10).
// Reported, deciding nothing: per symbol and series; windows the gate refuses; carried share under 0.30.
// What the bars decide. Pass all three: the README records that the shipped one-tick route holds on a real
// feed, and nothing changes in code. Fail T2: the shipped catch-up sentence (updateRateLines, "the moves that
// end runs of repeats grow with the run, as a stale figure catching up would") gains a clause that trade
// prints resting at a quote one tick wide can show the same pattern with nothing carried. Fail T1 or T3
// only: the README records which and nothing changes.
//
// Disclosed beforehand: the quoted-tick round's output was read before this header (each symbol's print
// count, quoted tick, smallest step, median move and class, and the growth test's counts by stretch length).
// No likelihood test was run on any real window; the run time (about 1.6 s a window) was timed on a
// simulated rounded walk.
//
// Amended before any result was read: the first run (PER = 20, 1,200 windows) was stopped at the session's
// 30-minute limit with no output written; real carried windows take about 10 s (timed on four real windows,
// ADAUSDT and BTCUSDT steps 3000-3300, prints and D = 1, with the test's result not printed), not the 1.6 s timed on
// simulation. PER is now 6 (360 windows). The second run computed every window twice (stale-real-trades.mjs,
// imported here, answers the same worker flag) and stopped with half the rows empty before printing anything;
// the worker flag is now this script's own. Nothing else changed.
//
// usage: node eval/stale-one-tick-binance.mjs <dir> > eval/stale-one-tick-binance.out.txt
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleEvery, judgeWindow, WINDOW, TAU } from './stale-real-trades.mjs';
import { SYMBOLS, DAY, GRID, readBinancePrints } from './stale-growth-quoted-tick.mjs';

export const PER = 6;

/** PER evenly spaced window starts out of n windows. */
export function pick(n, per = PER) {
  if (n <= per) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: per }, (_, i) => Math.floor((i * n) / per));
}

export function bars(rows) {
  const g = rows.filter((r) => r.gate);
  const t1 = g.filter((r) => r.kind !== 'prints' && r.carried >= 0.3);
  const t2 = g.filter((r) => r.kind === 'prints');
  const t3 = g.filter((r) => r.kind !== 'prints' && r.stale);
  const ok3 = (r) => Math.abs(r.fitted - r.carried) <= 0.1;
  const mk = (a, k, cmp) => ({ n: a.length, k, pass: a.length >= 10 && cmp(k / a.length) });
  return {
    T1: mk(t1, t1.filter((r) => r.stale).length, (s) => s >= 0.8),
    T2: mk(t2, t2.filter((r) => r.stale).length, (s) => s <= 0.1),
    T3: mk(t3, t3.filter(ok3).length, (s) => s >= 0.8),
  };
}

async function run(jobs, threads) {
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { binanceOneTick: true } });
    const feed = () => { if (next >= jobs.length) { wk.terminate(); resolve(); return; } const i = next++; wk.postMessage([i, jobs[i]]); };
    wk.on('message', ([i, r]) => { out[i] = r; done++; if (done % 20 === 0) process.stderr.write(`${done} of ${jobs.length}\n`); feed(); });
    wk.on('error', reject);
    feed();
  })));
  return out;
}

const f2 = (x) => (x == null ? '-' : x.toFixed(2));

if (!isMainThread && workerData && workerData.binanceOneTick) {
  parentPort.on('message', ([i, j]) => {
    const r = judgeWindow(j.v, j.traded, 0, j.v.length - 1, j.tick);
    parentPort.postMessage([i, { sym: j.sym, kind: j.kind, w: j.w, ...r }]);
  });
} else if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'binance-data';
  const t0 = Date.now();
  const ticks = JSON.parse(readFileSync(join(dir, 'ticks.json'), 'utf8'));
  const jobs = [];
  for (const sym of SYMBOLS) {
    const f = join(dir, `${sym}-trades-${DAY}.csv`);
    if (!existsSync(f)) continue;
    const prints = readBinancePrints(readFileSync(f, 'utf8'));
    const tick = Number(ticks[sym]);
    const series = [['prints', { v: prints.map((x) => x.p), traded: prints.map(() => true) }], ...GRID.map((D) => [`D=${D}`, sampleEvery(prints, D)])];
    for (const [kind, s] of series) {
      const n = Math.floor((s.v.length - 1) / WINDOW);
      for (const w of pick(n)) { const from = w * WINDOW, to = from + WINDOW; jobs.push({ sym, kind, w, tick, v: s.v.slice(from, to + 1), traded: s.traded.slice(from, to + 1) }); }
    }
  }
  const threads = Math.max(1, Math.min(4, cpus().length));
  const rows = await run(jobs, threads);
  console.log(`# shipped one-tick stale test on real one-tick feeds, Binance spot ${DAY} (pre-registered); window ${WINDOW}, tau ${TAU}, ${PER} windows a series, ${threads} threads\n`);
  console.log('symbol  series  windows  gate runs  carried (mean)  called stale (gated)  |fitted - carried| median (gated, stale)');
  const groups = new Map();
  for (const r of rows) { const k = `${r.sym}  ${r.kind}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, g] of groups) {
    const gg = g.filter((r) => r.gate), st = gg.filter((r) => r.stale);
    const e = st.map((r) => Math.abs(r.fitted - r.carried)).sort((a, b) => a - b);
    console.log(`${k}  ${g.length}  ${gg.length}  ${f2(g.reduce((a, r) => a + r.carried, 0) / g.length)}  ${st.length}  ${f2(e[e.length >> 1])}`);
  }
  const b = bars(rows);
  console.log('\n## Bars (gated windows, pooled)\n');
  console.log(`T1 power, carried >= 0.30: ${b.T1.k} of ${b.T1.n} (bar >= 80%, n >= 10): ${b.T1.pass ? 'pass' : 'fail'}`);
  console.log(`T2 size, trade prints: ${b.T2.k} of ${b.T2.n} (bar <= 10%, n >= 10): ${b.T2.pass ? 'pass' : 'fail'}`);
  console.log(`T3 estimate within 0.10: ${b.T3.k} of ${b.T3.n} (bar >= 80%, n >= 10): ${b.T3.pass ? 'pass' : 'fail'}`);
  const grid = rows.filter((r) => r.gate && r.kind !== 'prints');
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.2], [0.2, 0.3]]) { const g = grid.filter((r) => r.carried >= lo && r.carried < hi); console.log(`reported: gated grid windows carried ${lo}-${hi}: ${g.filter((r) => r.stale).length} of ${g.length} called stale`); }
  const off = rows.filter((r) => !r.gate);
  console.log(`reported: windows the gate refuses: ${off.length} of ${rows.length} (${off.filter((r) => r.kind === 'prints').length} print windows)`);
  console.log(`\nper window (symbol series window carried repeats medTicks gate lr stale fitted):`);
  for (const r of rows) console.log([r.sym, r.kind, r.w, f2(r.carried), f2(r.repeats), f2(r.medTicks), r.gate ? 'gate' : '-', f2(r.lr), r.stale ? 'STALE' : '-', f2(r.fitted)].join(' '));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
