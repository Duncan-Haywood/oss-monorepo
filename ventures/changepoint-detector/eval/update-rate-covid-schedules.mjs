// Pre-registered (this header committed before the script was first run on the data): the shipped
// update-rate check (update-rate.mjs, UPDATE_RATE and CATCHUP, unchanged) against a PROVIDER'S OWN
// documented changes in how often a feed publishes. The currency-peg round (eval/update-rate-pegs.mjs,
// README "Currency pegs") asked next for "a fresh labelled set of documented feed changes (a provider's
// announced switch from daily to weekly publication ...), not more pegs".
//
// The labels: JHU CSSE's COVID-19 repository README, section "Irregular Update Schedules" (United States),
// which records, per state, when its health department moved to publishing fewer days a week, e.g.
// "Delaware: Providing data once weekly (Wednesdays) (as of December 15, 2022). ~~Providing data
// Monday-Friday.~~". Only that README was read before this header was written; no series was looked at.
// The series: JHU's time_series_covid19_confirmed_US.csv (CC BY 4.0), cumulative confirmed cases summed
// over each state's rows, one row per calendar day, 2020-01-22..2023-03-09. A day the state did not
// publish repeats the day before, so a move from Monday-Friday (2 of 7 days repeat) to once a week (6 of 7)
// is a change in the repeat share the check is built to date.
//
// PRIMARY events (scored): every US line that gives a dated switch to a once-a-week schedule AND names the
// more frequent schedule it replaced, so the direction ('less often') is documented, not assumed:
export const PRIMARY = [
  ['Alabama', '2022-08-01', 'Mon-Fri -> Thursdays only'],
  ['Alaska', '2022-04-04', 'Mon/Wed/Fri -> weekly (Wed)'],
  ['California', '2022-09-15', 'Tue+Fri -> weekly (Thu)'],
  ['Delaware', '2022-12-15', 'Mon-Fri -> weekly (Wed)'],
  ['District of Columbia', '2022-03-04', 'Mon-Fri -> weekly (Thu)'],
  ['Georgia', '2022-04-20', 'Mon-Fri -> weekly (Wed)'],
  ['Idaho', '2022-10-17', 'Mon/Wed/Fri -> weekly (Wed)'],
  ['Indiana', '2022-10-01', 'Mon/Wed/Fri -> weekly (Wed)'],
  ['Kansas', '2022-04-01', 'Mon/Wed/Fri -> weekly (Fri)'],
  ['Kentucky', '2022-03-07', 'Mon-Fri -> weekly (Mon)'],
  ['Louisiana', '2022-10-14', 'Mon-Fri -> weekly (Wed)'],
  ['Massachusetts', '2022-07-11', 'Mon-Fri -> weekly (Thu)'],
  ['Michigan', '2022-04-04', 'Mon/Wed/Fri -> weekly (Wed)'],
  ['Minnesota', '2022-06-30', 'Mon-Fri -> weekly (Thu)'],
  ['Missouri', '2022-04-01', 'Mon-Fri -> weekly (Fri)'],
  ['Montana', '2022-05-06', 'Mon-Fri -> weekly (Fri)'],
  ['Nevada', '2022-03-16', 'Mon-Fri -> weekly (Wed)'],
  ['New Hampshire', '2022-05-16', 'Mon-Fri -> weekly (Thu)'],
  ['North Carolina', '2022-04-06', 'Mon-Fri -> weekly (Wed)'],
  ['Oregon', '2022-09-15', 'Mon-Fri -> weekly (Wed)'],
  ['South Carolina', '2022-03-15', 'Mon-Fri -> weekly (Tue)'],
  ['South Dakota', '2022-04-12', 'Mon-Fri -> weekly'],
  ['Texas', '2022-11-30', 'Mon/Wed/Fri -> weekly (Mon)'],
  ['Utah', '2022-03-31', 'Mon-Fri -> weekly (Thu)'],
  ['Vermont', '2022-05-19', 'daily -> weekly (Wed)'],
  ['Virginia', '2022-12-27', 'Mon-Fri -> weekly (Tue)'],
  ['Washington', '2022-11-02', 'Mon-Sat -> weekly (Wed)'],
].map(([state, date, what]) => ({ state, date, what, direction: 'less often' }));
// Left out of PRIMARY, by rule, from the README text alone: weekly -> weekly (Alabama 2022-11-16, Alaska
// 2022-11-08, Kansas later Wednesdays: no change in rate); no prior schedule named (Arizona, Hawaii,
// Pennsylvania, Maryland, New Jersey, Missouri 2022-02-22, Texas 2022-08-01, Michigan 2021-07-07);
// state and county figures on different schedules, so a sum over county rows has no single documented
// schedule (Mississippi, Oklahoma, Rhode Island, Ohio); undated (Iowa, Tennessee, Wyoming's weekly
// switch, Washington's August/December lines with no year); Maine 2023-02-21 (16 days before the series
// ends, under the check's 20-step minimum stretch); Florida weekly -> fortnightly (scored below, D3).
//
// SECONDARY events (D3, descriptive, no bar): dated changes between two named schedules that are not a
// move to once a week, either direction:
export const SECONDARY = [
  ['Arkansas', '2021-07-24', 'Mon-Fri -> daily (weekends resume)', 'more often'],
  ['Alaska', '2021-08-02', 'Mon/Wed/Fri -> Mon-Fri', 'more often'],
  ['Alaska', '2021-12-07', 'Mon-Fri -> Mon/Wed/Fri', 'less often'],
  ['Alabama', '2021-09-17', 'Mon-Fri -> daily', 'more often'],
  ['Alabama', '2022-03-04', 'daily -> Mon-Fri', 'less often'],
  ['California', '2022-04-04', 'Mon-Fri -> Tue+Fri', 'less often'],
  ['Florida', '2022-03-11', 'weekly -> every two weeks', 'less often'],
  ['Idaho', '2021-09-11', 'Mon-Fri -> daily', 'more often'],
  ['Idaho', '2021-11-06', 'daily -> Mon-Sat', 'less often'],
  ['Idaho', '2022-04-20', 'Mon-Fri -> Mon/Wed/Fri', 'less often'],
  ['Indiana', '2022-03-29', 'Mon-Fri -> Mon/Wed/Fri', 'less often'],
  ['Michigan', '2021-08-09', 'Tue+Fri -> Mon/Wed/Fri', 'more often'],
  ['Nebraska', '2021-08-11', '? -> Wednesdays only', 'less often'],
  ['Nebraska', '2021-09-25', 'Wednesdays only -> Mon-Fri', 'more often'],
  ['Oregon', '2021-07-10', 'daily -> Mon-Fri', 'less often'],
  ['South Dakota', '2021-08-16', 'Wednesdays only -> Mon-Fri', 'more often'],
  ['Texas', '2022-09-12', 'Mon-Fri -> Mon/Wed/Fri', 'less often'],
  ['Vermont', '2021-08-21', 'Mon-Fri -> daily', 'more often'],
  ['West Virginia', '2022-03-14', 'daily -> Mon-Fri', 'less often'],
].map(([state, date, what, direction]) => ({ state, date, what, direction }));
// (Two secondary rows carry an assumption the README does not state: Nebraska 2021-08-11's prior schedule
// and Oregon 2021-07-10's "daily" before Mon-Fri; Alabama 2021-09-17 and 2022-03-04 read the struck-through
// lines in order. They are descriptive only.)
//
// An event is DATED when the check reports a change in the stated direction whose range [from, to]
// overlaps the event window, the date +-10 rows (days), as in the peg round.
// Rules, fixed now:
//   D1  at least 19 of the 27 primary events dated (70%, the peg round's 5 of 7 rounded down);
//   D2  median range width (rows) over the dated primary events <= 60, the peg round's bar;
//   D3  descriptive: secondary events dated, by direction;
//   D4  descriptive: changes on the 27 primary states' series that match no primary event (a state's
//       first weeks of zero cases, the 2020 holidays, and the secondary schedule changes are expected
//       here; nothing labels the rest), with their dates.
// Pass D1 and D2: the README says the check dates a provider's documented switch to weekly publication.
// Fail: it says which events it missed and why, and nothing in the check changes on this file.
// usage: sh eval/covid-schedules-fetch.sh covid-data && node eval/update-rate-covid-schedules.mjs covid-data > eval/update-rate-covid-schedules.out.txt
import { updateRateChanges } from '../update-rate.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOL = 10;

// Minimal CSV split for JHU's file: quoted fields (Combined_Key) may hold commas.
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const iso = (mdy) => { const [m, d, y] = mdy.split('/').map(Number); return `${2000 + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

/** Map state -> { dates, values }: cumulative confirmed cases summed over the state's rows. */
export function readStates(file) {
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const first = head.indexOf('1/22/20'), stateCol = head.indexOf('Province_State');
  const dates = head.slice(first).map(iso);
  const by = new Map();
  for (const line of lines.slice(1)) {
    const f = splitCsv(line), st = f[stateCol];
    if (!by.has(st)) by.set(st, { dates, values: new Array(dates.length).fill(0) });
    const v = by.get(st).values;
    for (let j = 0; j < dates.length; j++) v[j] += Number(f[first + j]) || 0;
  }
  return by;
}

const rowOf = (dates, d) => { const i = dates.findIndex((x) => x >= d); return i < 0 ? dates.length - 1 : i; };
export function eventWindow(dates, e) {
  const a = rowOf(dates, e.date);
  return [Math.max(0, a - TOL), Math.min(dates.length - 1, a + TOL)];
}
export function scoreEvent(series, e, u) {
  const [w0, w1] = eventWindow(series.dates, e);
  const hit = u.changes.find((c) => c.direction === e.direction && c.from <= w1 && c.to >= w0);
  return { hit, window: [w0, w1] };
}

const pct = (v) => `${(100 * v).toFixed(0)}%`;
const median = (w) => { const s = [...w].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const by = readStates(join(process.argv[2] || 'covid-data', 'time_series_covid19_confirmed_US.csv'));
  const cache = new Map();
  const run = (st) => { if (!cache.has(st)) cache.set(st, updateRateChanges(by.get(st).values)); return cache.get(st); };
  const D = (s, i) => s.dates[Math.min(i, s.dates.length - 1)];
  const line = (e, s, hit, window) => `${e.state.padEnd(21)} ${e.date} ${e.direction.padEnd(10)} ${e.what.padEnd(28)} window ${D(s, window[0])}..${D(s, window[1])}: ${hit ? `DATED at ${D(s, hit.index)} [${D(s, hit.from)}..${D(s, hit.to)}], width ${hit.to - hit.from} rows, repeats ${pct(hit.shareBefore)} -> ${pct(hit.shareAfter)}` : 'missed'}`;

  console.log('Primary events (a dated switch to once a week)');
  const widths = []; let dated = 0; const matched = new Set();
  for (const e of PRIMARY) {
    const s = by.get(e.state), { hit, window } = scoreEvent(s, e, run(e.state));
    if (hit) { dated++; widths.push(hit.to - hit.from); matched.add(`${e.state}:${hit.index}`); }
    console.log(line(e, s, hit, window));
  }
  const med = median(widths);
  console.log(`\nD1 dated ${dated} of ${PRIMARY.length} (bar >= 19): ${dated >= 19 ? 'pass' : 'FAIL'}`);
  console.log(`D2 median range width ${med} rows (bar <= 60): ${med <= 60 ? 'pass' : 'FAIL'}`);

  console.log('\nD3 (descriptive) secondary events');
  const sec = { 'less often': [0, 0], 'more often': [0, 0] };
  for (const e of SECONDARY) {
    const s = by.get(e.state), { hit, window } = scoreEvent(s, e, run(e.state));
    sec[e.direction][1]++; if (hit) sec[e.direction][0]++;
    console.log(line(e, s, hit, window));
  }
  for (const [k, [a, b]] of Object.entries(sec)) console.log(`  ${k}: ${a} of ${b} dated`);

  console.log('\nD4 (descriptive) every change on the primary states, * = matched a primary event');
  for (const st of [...new Set(PRIMARY.map((e) => e.state))]) {
    const s = by.get(st), u = run(st);
    console.log(`${st}: n ${s.values.length}, repeats ${u.repeats} (${pct(u.repeats / Math.max(1, u.steps))}), ${u.changes.length} changes`);
    for (const c of u.changes) console.log(`  ${matched.has(`${st}:${c.index}`) ? '*' : ' '} ${D(s, c.index)} [${D(s, c.from)}..${D(s, c.to)}] ${c.direction} ${pct(c.shareBefore)} -> ${pct(c.shareAfter)}`);
  }
}
