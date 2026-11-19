// Pre-registered (README "The trade side: the shipped one-tick stale test on side-adjusted prices", 2026-11-19):
// the shipped stale test (rounded-walk.mjs `staleTestMarkov`, CATCHUP.lr 6.56) behind the shipped one-tick gate,
// on Binance spot trades of a fresh day, with each print moved half a quoted tick toward the inside of the book
// by its side.
//
// Why. The round before this one (eval/stale-one-tick-binance.mjs, 2026-11-02) failed size on the real null:
// 16 of 68 trade-print windows called stale with nothing carried, on pairs where 42-84% of prints repeat the
// last price. Read afterwards: prints that sit on one side of a one-tick book until its queue is worked off
// make clumped exact repeats, and a bounce between bid and ask makes one-tick moves, so the rounded walk under
// the null cannot make both at once. Each Binance trade row says which side it hit (buyer-is-maker: a taker
// sold, the print is at the bid). Moving each print half a tick toward the middle (bid + tick/2, ask - tick/2)
// removes the bounce when the book is one tick wide: a sell at the bid and a buy at the ask of the same book
// land on the same value, and the series moves only when the book moves. The question is whether the shipped
// test, unchanged, is then calibrated on prints and still finds a carried feed.
//
// Data (fresh, not committed): Binance spot trades for DAY below (data.binance.vision daily trade files), the
// twelve pairs of the previous round, and each pair's quoted tick (PRICE_FILTER tickSize, data-api.binance.vision
// exchangeInfo, read on the day of the run); `node eval/stale-side-mid-binance.mjs --fetch <dir>`. DAY was
// chosen before any file of it was downloaded: one week after the spent 2026-11-02, the same weekday.
// A trade row is id, price, qty, quote qty, time, buyer-is-maker, best match. Trades that share a timestamp are
// one print at the last trade's price and side (as eval/stale-growth-quoted-tick.mjs readBinancePrints).
//
// Series per pair, two arms:
//   side: m = p + tick/2 when the buyer is the maker (print at the bid), p - tick/2 otherwise;
//   raw:  p, as in the previous round (a fresh-day replication of its T2, deciding nothing).
// For each arm: the prints (the real null) and the last print's value every D = 0.5, 1 and 2 s (sampleEvery;
// the print times say which samples were carried). D = 5 is dropped: the previous round's D = 5 windows were
// mostly refused by the gate or carried under 0.30. Windows: non-overlapping 300 steps, PER evenly spaced ones
// a series (pick, as the previous round). Tick: the quoted tick. Each window's truth: its share of steps with
// no print. Scored where the shipped pipeline runs the test: windows the one-tick gate passes.
//
// Bars (side arm, gated windows, pooled over pairs):
//   S1 size on the real null: print windows called stale in <= 10% (n >= 10).
//   S2 power: grid windows with carried share >= 0.30 called stale in >= 80% (n >= 10).
//   S3 the estimate: grid windows called stale with |fitted - carried| <= 0.10 in >= 80% (n >= 10).
// Reported, deciding nothing: the raw arm on the same windows (does the 2026-11-02 size failure replicate on a
// fresh day); per pair and series; the share of print repeats whose side equals the previous print's side.
// What the bars decide. Pass S1 and S2: update-rate.mjs exports `sideAdjusted` (this transform), and the
// shipped trade-print caveat in updateRateLines gains a clause that a file with each trade's side can be tested
// on the side-adjusted price, with the measured counts in the README. Fail S1: the trade side does not separate
// resting at a quote from carrying forward for this test, the README says so, and nothing in code changes.
// Fail S2 or S3 only: the README records which, and nothing in code changes.
//
// Disclosed beforehand: before this header was committed, the only contact with DAY's data was an HTTP status
// and size check on the DOTUSDT 2026-11-09 file (200, 287,554 bytes; its body was discarded unread) and a
// status check on the BTCUSDT exchangeInfo reply (200, body discarded). The 2026-11-02 files and results are
// the previous round's and chose this transform.
//
// usage: node eval/stale-side-mid-binance.mjs --fetch <dir>
//        node eval/stale-side-mid-binance.mjs <dir> > eval/stale-side-mid-binance.out.txt
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleEvery, judgeWindow, WINDOW, TAU } from './stale-real-trades.mjs';
import { SYMBOLS } from './stale-growth-quoted-tick.mjs';
import { pick } from './stale-one-tick-binance.mjs';

export const DAY = '2026-11-09';
export const GRID = [0.5, 1, 2];
export const PER = 4;

/** Prints [{ t, p, bm }] from a Binance spot trades CSV, one per timestamp at its last trade (bm: buyer is maker). */
export function readSidedPrints(text) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, ''); start = end + 1;
    const f = line.split(',');
    if (f.length < 6) continue;
    const p = Number(f[1]), raw = Number(f[4]);
    if (!Number.isFinite(p) || !Number.isFinite(raw)) continue; // a header row
    const bm = /^true$/i.test(f[5].trim());
    const t = raw > 1e14 ? raw / 1e6 : raw / 1e3;
    if (out.length && out.at(-1).t === t) { out.at(-1).p = p; out.at(-1).bm = bm; }
    else out.push({ t, p, bm });
  }
  return out;
}

/** The print moved half a tick toward the inside of the book by its side: bid + tick/2, ask - tick/2. */
export function sideAdjusted(p, buyerIsMaker, tick) { return buyerIsMaker ? p + tick / 2 : p - tick / 2; }

/** Share of print repeats (same price as the previous print) whose side also equals the previous print's. */
export function sameSideRepeatShare(prints) {
  let rep = 0, same = 0;
  for (let i = 1; i < prints.length; i++) if (prints[i].p === prints[i - 1].p) { rep++; if (prints[i].bm === prints[i - 1].bm) same++; }
  return rep ? same / rep : null;
}

export function bars(rows, arm = 'side') {
  const g = rows.filter((r) => r.arm === arm && r.gate);
  const s1 = g.filter((r) => r.kind === 'prints');
  const s2 = g.filter((r) => r.kind !== 'prints' && r.carried >= 0.3);
  const s3 = g.filter((r) => r.kind !== 'prints' && r.stale);
  const mk = (a, k, cmp) => ({ n: a.length, k, pass: a.length >= 10 && cmp(k / a.length) });
  return {
    S1: mk(s1, s1.filter((r) => r.stale).length, (s) => s <= 0.1),
    S2: mk(s2, s2.filter((r) => r.stale).length, (s) => s >= 0.8),
    S3: mk(s3, s3.filter((r) => Math.abs(r.fitted - r.carried) <= 0.1).length, (s) => s >= 0.8),
  };
}

/** Jobs for one pair: both arms, prints and grid series, PER windows each. */
export function jobsFor(sym, prints, tick, per = PER) {
  const jobs = [];
  for (const arm of ['side', 'raw']) {
    const pts = arm === 'side' ? prints.map((x) => ({ t: x.t, p: sideAdjusted(x.p, x.bm, tick) })) : prints;
    const series = [['prints', { v: pts.map((x) => x.p), traded: pts.map(() => true) }], ...GRID.map((D) => [`D=${D}`, sampleEvery(pts, D)])];
    for (const [kind, s] of series) {
      const n = Math.floor((s.v.length - 1) / WINDOW);
      for (const w of pick(n, per)) { const from = w * WINDOW, to = from + WINDOW; jobs.push({ sym, arm, kind, w, tick, v: s.v.slice(from, to + 1), traded: s.traded.slice(from, to + 1) }); }
    }
  }
  return jobs;
}

async function run(jobs, threads) {
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { binanceSideMid: true } });
    const feed = () => { if (next >= jobs.length) { wk.terminate(); resolve(); return; } const i = next++; wk.postMessage([i, jobs[i]]); };
    wk.on('message', ([i, r]) => { out[i] = r; done++; if (done % 20 === 0) process.stderr.write(`${done} of ${jobs.length}\n`); feed(); });
    wk.on('error', reject);
    feed();
  })));
  return out;
}

const f2 = (x) => (x == null ? '-' : x.toFixed(2));

if (!isMainThread && workerData && workerData.binanceSideMid) {
  parentPort.on('message', ([i, j]) => {
    const r = judgeWindow(j.v, j.traded, 0, j.v.length - 1, j.tick);
    parentPort.postMessage([i, { sym: j.sym, arm: j.arm, kind: j.kind, w: j.w, ...r }]);
  });
} else if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--fetch') {
    const dir = process.argv[3] || 'binance-side';
    mkdirSync(dir, { recursive: true });
    const curl = (url, out) => execFileSync('curl', ['-sSfL', '--retry', '3', '-m', '600', '-o', out, url], { stdio: 'inherit' });
    const info = join(dir, 'exchangeInfo.json');
    if (!existsSync(info)) curl(`https://data-api.binance.vision/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS))}`, info);
    const ticks = {};
    for (const s of JSON.parse(readFileSync(info, 'utf8')).symbols) ticks[s.symbol] = s.filters.find((f) => f.filterType === 'PRICE_FILTER').tickSize;
    writeFileSync(join(dir, 'ticks.json'), JSON.stringify(ticks, null, 1));
    for (const s of SYMBOLS) {
      const csv = join(dir, `${s}-trades-${DAY}.csv`);
      if (existsSync(csv)) continue;
      const zip = join(dir, `${s}-trades-${DAY}.zip`);
      try { curl(`https://data.binance.vision/data/spot/daily/trades/${s}/${s}-trades-${DAY}.zip`, zip); execFileSync('unzip', ['-o', '-q', zip, '-d', dir]); }
      catch (e) { console.log(`${s}: not fetched (${e.message.split('\n')[0]})`); }
    }
    console.log(`ticks: ${JSON.stringify(ticks)}`);
  } else {
    const dir = process.argv[2] || 'binance-side';
    const t0 = Date.now();
    const ticks = JSON.parse(readFileSync(join(dir, 'ticks.json'), 'utf8'));
    const jobs = [], sameSide = {}, missing = [];
    for (const sym of SYMBOLS) {
      const f = join(dir, `${sym}-trades-${DAY}.csv`);
      if (!existsSync(f)) { missing.push(sym); continue; }
      const prints = readSidedPrints(readFileSync(f, 'utf8'));
      sameSide[sym] = { prints: prints.length, share: sameSideRepeatShare(prints) };
      jobs.push(...jobsFor(sym, prints, Number(ticks[sym])));
    }
    const threads = Math.max(1, Math.min(4, cpus().length));
    const rows = await run(jobs, threads);
    console.log(`# shipped one-tick stale test on side-adjusted prices, Binance spot ${DAY} (pre-registered); window ${WINDOW}, tau ${TAU}, ${PER} windows a series, ${threads} threads`);
    if (missing.length) console.log(`not fetched, dropped: ${missing.join(', ')}`);
    console.log('\nsymbol  prints  tick  print repeats keeping the side');
    for (const sym of Object.keys(sameSide)) console.log(`${sym}  ${sameSide[sym].prints}  ${ticks[sym]}  ${f2(sameSide[sym].share)}`);
    console.log('\nsymbol  arm  series  windows  gate runs  carried (mean)  called stale (gated)  |fitted - carried| median (gated, stale)');
    const groups = new Map();
    for (const r of rows) { const k = `${r.sym}  ${r.arm}  ${r.kind}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, g] of groups) {
      const gg = g.filter((r) => r.gate), st = gg.filter((r) => r.stale);
      const e = st.map((r) => Math.abs(r.fitted - r.carried)).sort((a, b) => a - b);
      console.log(`${k}  ${g.length}  ${gg.length}  ${f2(g.reduce((a, r) => a + r.carried, 0) / g.length)}  ${st.length}  ${f2(e[e.length >> 1])}`);
    }
    for (const arm of ['side', 'raw']) {
      const b = bars(rows, arm);
      console.log(`\n## ${arm === 'side' ? 'Bars: side arm (gated windows, pooled)' : 'Reported: raw arm, same rules (deciding nothing)'}\n`);
      console.log(`S1 size, trade prints: ${b.S1.k} of ${b.S1.n} (bar <= 10%, n >= 10): ${b.S1.pass ? 'pass' : 'fail'}`);
      console.log(`S2 power, carried >= 0.30: ${b.S2.k} of ${b.S2.n} (bar >= 80%, n >= 10): ${b.S2.pass ? 'pass' : 'fail'}`);
      console.log(`S3 estimate within 0.10: ${b.S3.k} of ${b.S3.n} (bar >= 80%, n >= 10): ${b.S3.pass ? 'pass' : 'fail'}`);
      const off = rows.filter((r) => r.arm === arm && !r.gate);
      console.log(`windows the gate refuses: ${off.length} of ${rows.filter((r) => r.arm === arm).length} (${off.filter((r) => r.kind === 'prints').length} print windows)`);
    }
    console.log(`\nper window (symbol arm series window carried repeats medTicks gate lr stale fitted):`);
    for (const r of rows) console.log([r.sym, r.arm, r.kind, r.w, f2(r.carried), f2(r.repeats), f2(r.medTicks), r.gate ? 'gate' : '-', f2(r.lr), r.stale ? 'STALE' : '-', f2(r.fitted)].join(' '));
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
