// Pre-registered (README "The catch-up test gated on the quoted tick, on twelve exchange pairs", 2026-11-19):
// the catch-up test `catchUpGrowth` (update-rate.mjs, unchanged: Spearman of run length k against the move
// that ends it, z = r sqrt(n - 1), stale when z >= 1.645) on fresh real trades, with the multi-tick gate set
// by the venue's quoted tick instead of the data's smallest step, judged at 2,000 moves.
//
// Why. The previous round (README "The catch-up test by stretch length, on five fresh stocks", LOBSTER) failed
// L1 (29 of 38 carried stretches caught at 1,000 moves) while size held. Read afterwards: the files' half-cent
// tick (hidden orders execute at the midpoint) let MSFT, a one-cent stock, through the smallest-step gate,
// and on penny-spread stocks the prints grow with the run with nothing carried (bid-ask bounce). On the three
// stocks that move several cents, 28 of 33 were caught at 1,000 moves and 14 of 14 at 2,000, with no print
// stretch called stale. So this round gates on the quoted tick and judges at 2,000 moves. LOBSTER's files are
// spent; these are fresh.
//
// Data (fresh, not committed): Binance spot trades for one UTC day, DAY below, for the twelve SYMBOLS below
// (data.binance.vision daily trade files), and each symbol's quoted tick (PRICE_FILTER tickSize from
// data-api.binance.vision exchangeInfo, read on the day of the run), fetched by
// `node eval/binance-fetch.mjs <dir>`. The symbols and day were chosen before any file was downloaded: the
// large USDT pairs, with prices from a few cents to tens of thousands of dollars, so quoted ticks span one to
// many price moves. A trade row is id, price, qty, quote qty, time (microseconds since 2025; milliseconds
// before), buyer-is-maker, best match. Trades that share a timestamp are one taker order walking the book:
// one print, at the last price of that timestamp.
//
// Series. For each symbol: the trade prints (one step per print: the real null, nothing carried) and the
// last-trade price on a grid every D = 0.5, 1, 2 and 5 seconds (eval/stale-real-trades.mjs sampleEvery; the
// print times say which samples were carried). Tick: the quoted tick, for every series of the symbol.
// Stretches: eval/stale-growth-lobster.mjs stretchesByMoves (each holds exactly M moves), M = 300, 600, 1000,
// 2000; each stretch's truth is its share of steps with no print.
//
// The gate. Rule, fixed here before any file is read: a symbol is multi-tick when the median nonzero move of
// its day's prints, in quoted ticks (shipped medianMoveTicks with the quoted tick), is above ROUNDING_TICKS
// (1.5). The script prints each symbol's quoted tick, the smallest step in its prints, the median move and
// the class first. One-tick symbols are reported, not judged. A symbol whose file cannot be fetched is
// dropped and named.
//
// Bars (multi-tick symbols, pooled):
//   Q1 power: grid stretches of 2,000 moves with carried share >= 0.30 called stale in >= 80% (at least 10
//      stretches, else unscorable, which counts as a fail).
//   Q2 size: print stretches of 2,000 moves called stale in <= 10% (at least 10 stretches, as above).
//   Q3 size at every length: print stretches called stale in <= 10% at each of M = 300, 600, 1000, 2000
//      (a length with fewer than 5 stretches is skipped).
// Reported, deciding nothing: power at 300, 600 and 1,000 moves; per symbol and per D; the one-tick symbols on
// the same rules; whether the smallest step equals the quoted tick.
// What the bars decide. Pass all three: the CLI gains `--tick X` (the quoted tick, stated by the user), and
// with it the update-rate line gains a sentence for a sticky stretch that holds at least 2,000 moves with a
// median move above 1.5 of those ticks, saying whether the moves that end its runs grow with the run (a
// carried figure catching up) or not; without `--tick` nothing changes, since a tick inferred from the
// smallest step chose the wrong stocks on LOBSTER. Fail any: catchUpGrowth stays an exported function with no
// sentence, and the README records which bar failed.
//
// Disclosed beforehand: before this header was committed, the only contact with the data was an HTTP status
// check that the BTCUSDT 2026-11-01 file exists (its body was discarded unread) and the first 600 characters
// of the BTCUSDT exchangeInfo reply (rate limits and asset precision; the tick size was not reached).
//
// usage: node eval/stale-growth-quoted-tick.mjs <dir> > eval/stale-growth-quoted-tick.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smallestStep, medianMoveTicks, ROUNDING_TICKS } from '../update-rate.mjs';
import { sampleEvery } from './stale-real-trades.mjs';
import { scoreSeries, tally, LENGTHS } from './stale-growth-lobster.mjs';

export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT', 'LINKUSDT', 'AVAXUSDT', 'DOTUSDT', 'TRXUSDT'];
export const DAY = '2026-11-02';
export const GRID = [0.5, 1, 2, 5];
export const JUDGED = 2000;

/** Prints [{ t, p }] (t in seconds) from a Binance spot trades CSV, one per timestamp at its last price. */
export function readBinancePrints(text) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end); start = end + 1;
    const c1 = line.indexOf(','); if (c1 < 0) continue;
    const c2 = line.indexOf(',', c1 + 1), c3 = line.indexOf(',', c2 + 1), c4 = line.indexOf(',', c3 + 1), c5 = line.indexOf(',', c4 + 1);
    const p = Number(line.slice(c1 + 1, c2)), raw = Number(line.slice(c4 + 1, c5 < 0 ? undefined : c5));
    if (!Number.isFinite(p) || !Number.isFinite(raw)) continue; // a header row
    const t = raw > 1e14 ? raw / 1e6 : raw / 1e3;
    if (out.length && out.at(-1).t === t) out.at(-1).p = p;
    else out.push({ t, p });
  }
  return out;
}

export function bars(rows) {
  const j = tally(rows, JUDGED);
  const Q1 = { ...j.power, pass: j.power.n >= 10 && j.power.k / j.power.n >= 0.8 };
  const Q2 = { ...j.size, pass: j.size.n >= 10 && j.size.k / j.size.n <= 0.1 };
  const per = LENGTHS.map((M) => ({ M, ...tally(rows, M).size }));
  const Q3 = { per, pass: per.every((x) => x.n < 5 || x.k / x.n <= 0.1) };
  return { Q1, Q2, Q3 };
}

const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };

function main(dir) {
  const ticks = JSON.parse(readFileSync(join(dir, 'ticks.json'), 'utf8'));
  console.log(`# catch-up test gated on the quoted tick, Binance spot trades ${DAY} (pre-registered)\n\n## Symbols\n\nsymbol  prints  quoted tick  smallest step  median print move (quoted ticks)  class`);
  const data = new Map();
  for (const s of SYMBOLS) {
    const f = join(dir, `${s}-trades-${DAY}.csv`);
    if (!existsSync(f) || ticks[s] == null) { console.log(`${s}  dropped (no file or no tick)`); continue; }
    const prints = readBinancePrints(readFileSync(f, 'utf8'));
    const pv = prints.map((x) => x.p), tick = Number(ticks[s]);
    const m = medianMoveTicks(pv, 1, pv.length - 1, tick);
    const cls = m > ROUNDING_TICKS ? 'multi-tick' : 'one-tick';
    console.log(`${s}  ${prints.length}  ${+tick.toPrecision(6)}  ${+smallestStep(pv).toPrecision(6)}  ${m}  ${cls}`);
    data.set(s, { prints, tick, cls });
  }
  const multi = [], all = [];
  console.log('\n## Stretches\n\nsymbol  series  M  stretches  carried >= 0.30 (or prints)  called stale  share  median carried  median steps');
  for (const [s, { prints, tick, cls }] of data) {
    const series = [['prints', { v: prints.map((x) => x.p), traded: prints.map(() => true) }], ...GRID.map((D) => [`D=${D}`, sampleEvery(prints, D)])];
    for (const [kind, ser] of series) {
      for (const M of LENGTHS) {
        const rows = scoreSeries(kind, ser, tick, M).map((r) => ({ ...r, stock: s, cls }));
        all.push(...rows); if (cls === 'multi-tick') multi.push(...rows);
        const judged = kind === 'prints' ? rows : rows.filter((r) => r.carried >= 0.3);
        const k = judged.filter((r) => r.stale).length;
        console.log(`${s}  ${kind}  ${M}  ${rows.length}  ${judged.length}  ${k}  ${judged.length ? (k / judged.length).toFixed(2) : '-'}  ${rows.length ? med(rows.map((r) => r.carried)).toFixed(2) : '-'}  ${rows.length ? med(rows.map((r) => r.steps)) : '-'}`);
      }
    }
  }
  console.log('\n## Pooled by length\n\nclass  M  power (carried >= 0.30)  size (prints)');
  for (const [label, rows] of [['multi-tick', multi], ['one-tick', all.filter((r) => r.cls === 'one-tick')]]) {
    for (const M of LENGTHS) { const t = tally(rows, M); console.log(`${label}  ${M}  ${t.power.k} of ${t.power.n}  ${t.size.k} of ${t.size.n}`); }
  }
  const b = bars(multi);
  console.log('\n## Bars (multi-tick symbols)\n');
  console.log(`Q1 power at M = ${JUDGED}: ${b.Q1.k} of ${b.Q1.n} (bar >= 80%, n >= 10): ${b.Q1.pass ? 'pass' : 'fail'}`);
  console.log(`Q2 size at M = ${JUDGED}: ${b.Q2.k} of ${b.Q2.n} (bar <= 10%, n >= 10): ${b.Q2.pass ? 'pass' : 'fail'}`);
  console.log(`Q3 size at every length: ${b.Q3.per.map((x) => `M=${x.M} ${x.k} of ${x.n}`).join(', ')} (bar <= 10% each): ${b.Q3.pass ? 'pass' : 'fail'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] || 'binance-data');
