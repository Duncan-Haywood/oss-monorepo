// Pre-registered (this header committed before the script was first run on the data): the shipped
// update-rate check (update-rate.mjs, UPDATE_RATE and CATCHUP, unchanged) against DOCUMENTED changes in
// how often a real series moves. README "When a series starts updating less often" and the flagship's
// next: asked for "a long series with a documented change in collection to check a date against".
// A currency peg is the cleanest public case: while a central bank holds the rate, the Federal Reserve's
// noon quote repeats day after day; when the peg ends it starts moving. The dates are public policy
// announcements, written down here from the historical record before any of these series was looked at:
//
//   E1 China,     peg ends, 2005-07-21 (PBoC revaluation to 8.11, managed float)        -> 'more often'
//   E2 China,     re-peg near 6.83, de facto from mid-2008 (window 2008-06-01..2008-10-31) -> 'less often'
//   E3 China,     re-peg ends, 2010-06-19 announcement (first trading day 2010-06-21)   -> 'more often'
//   E4 Malaysia,  peg at 3.80 from 1998-09-02                                            -> 'less often'
//   E5 Malaysia,  peg ends 2005-07-21                                                    -> 'more often'
//   E6 Venezuela, exchange controls and a fixed rate from 2003-02-05                     -> 'less often'
//   E7 Thailand,  basket peg ends, baht floated 1997-07-02                               -> 'more often'
//
// An event is DATED when the check reports a change in the stated direction whose range [from, to]
// (as dates) overlaps the event window: the date +-10 trading rows of that series (E2: its window
// widened by 10 rows each side).
// Rules, fixed now:
//   D1  at least 5 of the 7 events dated;
//   D2  median range width (rows) over the dated events <= 60;
//   D3  descriptive, no bar: changes on five floating currencies (Japan, United Kingdom, Canada,
//       Switzerland, Australia), and every change on the pegged series that matches no event. Quotes
//       there may have changed precision over 50 years, which would be a real change in collection
//       that this file cannot label, so they are listed, not counted.
// Pass D1 and D2: the README says the check dates documented changes on real data. Fail: it says
// which events it missed and why, and nothing in the check changes on this file.
// Rows are the series' own trading days as given (the file has no blank rows); nothing is carried forward.
// usage: sh eval/fx-pegs-fetch.sh fx-data && node eval/update-rate-pegs.mjs fx-data > eval/update-rate-pegs.out.txt
import { updateRateChanges } from '../update-rate.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVENTS = [
  { id: 'E1', country: 'China', date: '2005-07-21', direction: 'more often' },
  { id: 'E2', country: 'China', from: '2008-06-01', to: '2008-10-31', direction: 'less often' },
  { id: 'E3', country: 'China', date: '2010-06-21', direction: 'more often' },
  { id: 'E4', country: 'Malaysia', date: '1998-09-02', direction: 'less often' },
  { id: 'E5', country: 'Malaysia', date: '2005-07-21', direction: 'more often' },
  { id: 'E6', country: 'Venezuela', date: '2003-02-05', direction: 'less often' },
  { id: 'E7', country: 'Thailand', date: '1997-07-02', direction: 'more often' },
];
export const CONTROLS = ['Japan', 'United Kingdom', 'Canada', 'Switzerland', 'Australia'];
const TOL = 10;

export function readSeries(file) {
  const by = new Map();
  for (const line of readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [d, c, v] = line.split(',');
    if (!by.has(c)) by.set(c, { dates: [], values: [] });
    const s = by.get(c); s.dates.push(d); s.values.push(v === '' ? NaN : Number(v));
  }
  return by;
}

// First row on or after date d (dates are ISO strings, so they compare as strings).
const rowOf = (dates, d) => { let i = dates.findIndex((x) => x >= d); return i < 0 ? dates.length - 1 : i; };

export function eventWindow(dates, e) {
  const a = rowOf(dates, e.from ?? e.date), b = rowOf(dates, e.to ?? e.date);
  return [Math.max(0, a - TOL), Math.min(dates.length - 1, b + TOL)];
}

export function scoreEvent(series, e, u = updateRateChanges(series.values)) {
  const [w0, w1] = eventWindow(series.dates, e);
  const hit = u.changes.find((c) => c.direction === e.direction && c.from <= w1 && c.to >= w0);
  return { hit, window: [w0, w1], u };
}

const pct = (v) => `${(100 * v).toFixed(0)}%`;
function describe(name, s, u) {
  const D = (i) => s.dates[Math.min(i, s.dates.length - 1)];
  const head = `${name}: n ${s.values.length} (${s.dates[0]}..${s.dates.at(-1)}), repeats ${u.repeats} (${pct(u.repeats / Math.max(1, u.steps))})`;
  if (!u.changes.length) return `${head}, no change of update rate`;
  const ch = u.changes.map((c) => `  ${D(c.index)} [${D(c.from)}..${D(c.to)}, ${c.to - c.from} rows] ${c.direction} ${pct(c.shareBefore)} -> ${pct(c.shareAfter)}${c.rounding ? ` (rounding: tick ${+c.tick.toPrecision(6)})` : ''}`);
  return [head, ...ch].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const by = readSeries(join(process.argv[2] || 'fx-data', 'daily.csv'));
  const cache = new Map();
  const run = (c) => { if (!cache.has(c)) cache.set(c, updateRateChanges(by.get(c).values)); return cache.get(c); };
  console.log('Pegged series, every change the check reports');
  for (const c of ['China', 'Malaysia', 'Venezuela', 'Thailand']) console.log(describe(c, by.get(c), run(c)));
  console.log('\nEvents');
  const widths = []; let dated = 0;
  const matched = new Set();
  for (const e of EVENTS) {
    const s = by.get(e.country), { hit, window } = scoreEvent(s, e, run(e.country));
    if (hit) { dated++; widths.push(hit.to - hit.from); matched.add(`${e.country}:${hit.index}`); }
    console.log(`${e.id} ${e.country.padEnd(10)} ${(e.date ?? `${e.from}..${e.to}`).padEnd(22)} ${e.direction.padEnd(10)} window ${s.dates[window[0]]}..${s.dates[window[1]]}: ${hit ? `DATED at ${s.dates[hit.index]} [${s.dates[hit.from]}..${s.dates[Math.min(hit.to, s.dates.length - 1)]}], width ${hit.to - hit.from} rows` : 'missed'}`);
  }
  widths.sort((a, b) => a - b);
  const med = widths.length ? (widths.length % 2 ? widths[(widths.length - 1) / 2] : (widths[widths.length / 2 - 1] + widths[widths.length / 2]) / 2) : NaN;
  console.log(`\nD1 dated ${dated} of ${EVENTS.length} (bar >= 5): ${dated >= 5 ? 'pass' : 'FAIL'}`);
  console.log(`D2 median range width ${med} rows (bar <= 60): ${med <= 60 ? 'pass' : 'FAIL'}`);
  console.log('\nD3 (descriptive) changes matching no event on the pegged series:');
  for (const c of ['China', 'Malaysia', 'Venezuela', 'Thailand']) {
    const s = by.get(c), extra = run(c).changes.filter((ch) => !matched.has(`${c}:${ch.index}`));
    console.log(`  ${c}: ${extra.length ? extra.map((ch) => `${s.dates[ch.index]} ${ch.direction}`).join('; ') : 'none'}`);
  }
  console.log('D3 (descriptive) floating controls:');
  for (const c of CONTROLS) console.log(describe(`  ${c}`, by.get(c), run(c)));
}
