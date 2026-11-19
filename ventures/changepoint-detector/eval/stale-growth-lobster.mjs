// Pre-registered (README "The catch-up test by stretch length, on five fresh stocks", 2026-11-19): the
// catch-up test `catchUpGrowth` (update-rate.mjs, unchanged: Spearman of run length k against the move that
// ends it, z = r sqrt(n - 1), stale when z >= 1.645) on fresh real data, with the bar stated by how many
// moves a stretch holds rather than by how many samples.
//
// Why. The previous round (README "A catch-up test for multi-tick feeds") passed size on real trade prints
// (1 of 56) and failed power on a real carried feed (22 of 85 300-step windows). Read afterwards, the
// windows that held about a thousand moves were caught most of the time (D = 1, 2000 steps, median 648
// moves: 11 of 15; 4000 steps, median 1265 moves: 7 of 7) and the prints stayed clean at every length. That
// table chose the length; those files (highfrequency's samples) are spent. This round asks whether the
// length rule holds on data it has not seen.
//
// Data (fresh, not committed): LOBSTER's free sample files (lobsterdata.com), Nasdaq, 2012-06-21,
// 09:30-16:00, for AAPL, AMZN, GOOG, INTC and MSFT, fetched from the public mirror github.com/26Madhav/
// LOB_dynamics by `node eval/lobster-fetch.mjs <dir>` (git sparse clone). A trade is an execution message
// (type 4, visible, or 5, hidden); time in seconds after midnight, price in 1/10000 dollars (divided by
// 10,000 here). Executions that share a timestamp are one aggressive order walking the book: one print, at
// the last price of that timestamp.
//
// Series. For each stock: the trade prints (one step per print: the real null, nothing carried) and the
// last-trade price on a grid every D = 0.5, 1, 2 and 5 seconds (a sample with no print in its D seconds is
// carried forward; the print times say which). Tick: shipped smallestStep over each whole series.
//
// Stretches by moves. Each series is cut into consecutive non-overlapping stretches, each running from the
// end of the last until it holds M moves as catchUpGrowth counts them (M + 1 changes of value; float noise is
// a repeat), for M = 300, 600, 1000 and 2000; a tail with fewer than M moves is dropped. Each stretch's truth
// is its share of steps with no print (carried).
//
// Which stocks are judged. The test was built for multi-tick feeds (the shipped one-tick gate already sends
// one-tick stretches to the likelihood test). Rule, fixed here before any stretch is scored: a stock is
// multi-tick when the median nonzero move of its day's prints, in ticks (shipped medianMoveTicks), is above
// ROUNDING_TICKS (1.5). The script prints each stock's median move and class first. One-tick stocks are
// reported, not judged.
//
// Bars (multi-tick stocks, pooled; M = 1000):
//   L1 power: grid stretches with carried share >= 0.30 called stale in >= 80% (at least 10 stretches, else
//      unscorable, which counts as a fail).
//   L2 size: print stretches called stale in <= 10% at M = 1000 (at least 10 stretches, as above).
//   L3 size at every length: print stretches called stale in <= 10% at each of M = 300, 600, 1000, 2000
//      (a length with fewer than 5 stretches is skipped).
// Reported, deciding nothing: power at M = 300, 600 and 2000; carried share under 0.30; per stock and per D;
// the one-tick stocks on the same rules.
// What the bars decide. Pass all three: the update-rate line gains a sentence for a multi-tick sticky stretch
// that holds at least 1000 moves, saying whether the moves that end its runs grow with the run (a carried
// figure catching up) or not (repeats that read as a price resting at a quote, not a stale feed), and says
// nothing on shorter stretches. Fail any: catchUpGrowth stays an exported function with no sentence, and the
// README records which bar failed.
//
// Disclosed beforehand: the five files were inspected only for their format and row counts (AMZN: 11,419
// executions, 8,974 visible, 2,445 hidden); no stretch was scored and no move sizes were looked at before
// this header was committed.
//
// usage: node eval/stale-growth-lobster.mjs <dir> > eval/stale-growth-lobster.out.txt
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catchUpGrowth, floatNoise, smallestStep, medianMoveTicks, ROUNDING_TICKS } from '../update-rate.mjs';
import { sampleEvery } from './stale-real-trades.mjs';

export const STOCKS = ['AAPL', 'AMZN', 'GOOG', 'INTC', 'MSFT'];
export const GRID = [0.5, 1, 2, 5];
export const LENGTHS = [300, 600, 1000, 2000];
export const JUDGED = 1000;

export const fileFor = (dir, s) => join(dir, `${s}_2012-06-21_34200000_57600000_message_5.csv`);

/** Prints [{ t, p }] from a LOBSTER message file: executions (types 4, 5), one per timestamp (its last price). */
export function readPrints(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split(',');
    const type = c[1];
    if (type !== '4' && type !== '5') continue;
    const t = Number(c[0]), p = Number(c[4]) / 10000;
    if (out.length && out.at(-1).t === t) out.at(-1).p = p;
    else out.push({ t, p });
  }
  return out;
}

/** Stretches [from, to] that each hold exactly M moves as catchUpGrowth counts them (M + 1 changes). */
export function stretchesByMoves(v, M) {
  const out = [];
  let from = 0, changes = 0;
  for (let t = 1; t < v.length; t++) {
    if (v[t] === v[t - 1] || floatNoise(v[t], v[t - 1])) continue;
    if (++changes === M + 1) { out.push([from, t]); from = t; changes = 0; }
  }
  return out;
}

export function scoreSeries(kind, s, tick, M) {
  return stretchesByMoves(s.v, M).map(([from, to]) => {
    let carried = 0;
    for (let t = from + 1; t <= to; t++) if (!s.traded[t]) carried++;
    const g = catchUpGrowth(s.v, from, to, tick);
    return { kind, M, from, to, steps: to - from, carried: carried / (to - from), n: g?.n ?? 0, z: g?.z ?? null, stale: !!g?.grows };
  });
}

export function tally(rows, M) {
  const at = rows.filter((r) => r.M === M);
  const pw = at.filter((r) => r.kind !== 'prints' && r.carried >= 0.3), sz = at.filter((r) => r.kind === 'prints');
  const k = (a) => a.filter((r) => r.stale).length;
  return { power: { n: pw.length, k: k(pw) }, size: { n: sz.length, k: k(sz) } };
}

export function bars(rows) {
  const j = tally(rows, JUDGED);
  const L1 = { ...j.power, pass: j.power.n >= 10 && j.power.k / j.power.n >= 0.8 };
  const L2 = { ...j.size, pass: j.size.n >= 10 && j.size.k / j.size.n <= 0.1 };
  const per = LENGTHS.map((M) => ({ M, ...tally(rows, M).size }));
  const L3 = { per, pass: per.every((x) => x.n < 5 || x.k / x.n <= 0.1) };
  return { L1, L2, L3 };
}

function main(dir) {
  const multi = [], all = [];
  console.log('# catch-up test by stretch length, LOBSTER 2012-06-21 (pre-registered)\n\n## Stocks\n\nstock  prints  tick  median print move (ticks)  class');
  const data = new Map();
  for (const s of STOCKS) {
    const prints = readPrints(readFileSync(fileFor(dir, s), 'utf8'));
    const pv = prints.map((x) => x.p);
    const tick = smallestStep(pv);
    const med = medianMoveTicks(pv, 1, pv.length - 1, tick);
    const cls = med > ROUNDING_TICKS ? 'multi-tick' : 'one-tick';
    console.log(`${s}  ${prints.length}  ${+tick.toPrecision(6)}  ${med}  ${cls}`);
    data.set(s, { prints, cls });
  }
  console.log('\n## Stretches\n\nstock  series  M  stretches  carried >= 0.30 (or prints)  called stale  share  median carried  median steps');
  for (const [s, { prints, cls }] of data) {
    const series = [['prints', { v: prints.map((x) => x.p), traded: prints.map(() => true) }], ...GRID.map((D) => [`D=${D}`, sampleEvery(prints, D)])];
    for (const [kind, ser] of series) {
      const tick = smallestStep(ser.v);
      for (const M of LENGTHS) {
        const rows = scoreSeries(kind, ser, tick, M).map((r) => ({ ...r, stock: s, cls }));
        all.push(...rows); if (cls === 'multi-tick') multi.push(...rows);
        const judged = kind === 'prints' ? rows : rows.filter((r) => r.carried >= 0.3);
        const k = judged.filter((r) => r.stale).length;
        const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
        console.log(`${s}  ${kind}  ${M}  ${rows.length}  ${judged.length}  ${k}  ${judged.length ? (k / judged.length).toFixed(2) : '-'}  ${rows.length ? med(rows.map((r) => r.carried)).toFixed(2) : '-'}  ${rows.length ? med(rows.map((r) => r.steps)) : '-'}`);
      }
    }
  }
  console.log('\n## Pooled by length\n\nclass  M  power (carried >= 0.30)  size (prints)');
  for (const [label, rows] of [['multi-tick', multi], ['one-tick', all.filter((r) => r.cls === 'one-tick')]]) {
    for (const M of LENGTHS) { const t = tally(rows, M); console.log(`${label}  ${M}  ${t.power.k} of ${t.power.n}  ${t.size.k} of ${t.size.n}`); }
  }
  const b = bars(multi);
  console.log('\n## Bars (multi-tick stocks)\n');
  console.log(`L1 power at M = ${JUDGED}: ${b.L1.k} of ${b.L1.n} (bar >= 80%, n >= 10): ${b.L1.pass ? 'pass' : 'fail'}`);
  console.log(`L2 size at M = ${JUDGED}: ${b.L2.k} of ${b.L2.n} (bar <= 10%, n >= 10): ${b.L2.pass ? 'pass' : 'fail'}`);
  console.log(`L3 size at every length: ${b.L3.per.map((x) => `M=${x.M} ${x.k} of ${x.n}`).join(', ')} (bar <= 10% each): ${b.L3.pass ? 'pass' : 'fail'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] || 'lobster-data');
