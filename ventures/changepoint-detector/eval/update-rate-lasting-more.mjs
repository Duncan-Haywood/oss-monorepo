// Pre-registered: why the shipped update-rate cut misses LASTING moves to more publication days.
//
// Background (README "Short returns: a real drop in repeats", 2026-11-19, eval/update-rate-returns-guard.mjs):
// the guarded return pass dated 2 of JHU's 8 documented moves back to more frequent reporting. Read against the
// documented list (eval/update-rate-covid-schedules.mjs SECONDARY), five misses are not two-month returns at all:
// by the documented dates the move to more days lasted about four months in Alaska, eight in South Dakota, five
// and a half in Alabama, and has no listed end in Arkansas and Nebraska. Those are lasting changes of schedule,
// which the SHIPPED partition (UPDATE_RATE: two-state chain per stretch, 2 x 2 log n a cut) should cut, and D3 in
// eval/update-rate-covid-schedules.out.txt shows it dates 0 of the 8. That section's "Next": "why the shipped cut
// misses lasting moves to more days, with power cells no round has simulated (Wednesdays only to Monday-Friday,
// Monday/Wednesday/Friday to Monday-Friday, each for four to eight months), scored by the shipped check and the
// guarded pass together."
//
// Two questions, two parts. This header and every rule below were written before the file ran on any cell or
// on the real series. The real series are SEEN data (rounds 1-5 printed their D3/J2 lines), so Part B only
// describes and sorts by a rule fixed here; it changes nothing in the check.
//
// PART A (simulation, fresh seed 20261228; nothing is chosen, so one seed). n 1100 values (1099 indicators), day
// label t % 7 with 0 = Monday, a publishing day repeats with p 0.03, any other day with p 0.95 (rounds 1-5's
// schedule model). The move to more days starts at step 500 and lasts D steps, then the old schedule resumes;
// D in {120, 240, for good (to the end, 599 steps)}. Three moves, each from the documented list:
//   W1>W5: Wednesdays only -> Monday-Friday (Nebraska, South Dakota); repeats about 82% -> 30%;
//   W3>W5: Monday/Wednesday/Friday -> Monday-Friday (Alaska);          repeats about 56% -> 30%;
//   W5>W7: Monday-Friday -> daily (Arkansas, Alabama, Idaho, Vermont);  repeats about 30% -> 3%.
// 200 series a cell. FOUND (start) = a shipped 'more often' change whose index is within 10 steps of 500 (rounds
// 1-5's rule), or, in the combined column, a guarded return (round 5's chosen setting: per-stretch 'dow'/'chain',
// guard 'half', m 3; eval/update-rate-returns-guard.mjs guardedCandidates) starting within 10 steps of 500.
// END (descriptive) = a shipped 'less often' change within 10 steps of 500 + D.
// H1, the one bar: the shipped check ALONE finds the start in at least 180 of 200 series in every cell.
//   Pass: the cut has the power for these moves in the model, so the real misses come from the real series
//         (Part B says which way); fail: the README names the cells where the cut lacks power, and those are the
//         next round's target.
//
// PART B (real, seen, descriptive; needs covid-data, sh eval/covid-schedules-fetch.sh covid-data). For each of the
// 8 documented 'more often' events, with the event's row a (its date): the repeat share in the 56 rows before a
// (z rows a-57 .. a-2, the steps into values a-56 .. a-1) and in the 56 rows from a, the share each weekday in
// both windows, and the shares the documented schedules imply (Wednesdays only 6/7, Tue+Fri 5/7, Mon/Wed/Fri 4/7,
// Mon-Fri 2/7, daily 0, times 0.95 plus 0.03 on the rest as in Part A, so only the drop matters). Sorted by this
// rule, in order:
//   N "not in the data": observed drop (before - after) < half the drop the two schedules imply;
//   E "in the data, cut elsewhere": otherwise, if the shipped check has a 'more often' change whose range
//      [from, to] is within 60 rows of a (but not in the +-10 window, or it would have been dated);
//   C "in the data, not cut": otherwise.
// The README reports the counts and each state's line. Nothing in the check changes on this file whatever the
// counts; a later round that acts on them needs its own pre-registration.
// AMENDMENT (after the first launch, before any cell finished; no result was seen): the first run printed no
// cell in 30 minutes. One series took 20 s in updateRateChanges, all of it in the rounding verdict's stale-feed
// likelihood (staleTestMarkov), which runs because valuesFrom makes every move one tick. That verdict labels a
// change (rounding or catch-up); it never moves a cut or its direction, which is all Part A scores. So Part A
// calls the shipped check with `catchUp: { method: null }` (same cuts, same directions, verdict by median move
// alone). Part B, on the real series, runs the shipped check unchanged.
// usage: node eval/update-rate-lasting-more.mjs [covid-data] > eval/update-rate-lasting-more.out.txt
import { updateRateChanges, repeatIndicators, daysFromDates } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { valuesFrom } from './update-rate-returns.mjs';
import { guardedCandidates, GUARDS } from './update-rate-returns-guard.mjs';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SEED = 20261228, START = 500, TOL = 10, N = 1099, REPS = Number(process.env.REPS_SMOKE) || 200, M = 3;
const WIN = 56, NEAR = 60;
const pen = (n, m) => m * 2 * Math.log(n + 1);

function schedule(rnd, n, pub, pOn = 0.03, pOff = 0.95) { const z = []; for (let t = 0; t < n; t++) z.push(rnd() < (pub(t) ? pOn : pOff) ? 1 : 0); return z; }
const on = (...d) => (t) => d.includes(t % 7);
const W1 = on(2), W3 = on(0, 2, 4), W5 = on(0, 1, 2, 3, 4), W7 = () => true;
const MOVES = { 'W1>W5': [W1, W5], 'W3>W5': [W3, W5], 'W5>W7': [W5, W7] };
const DURS = [120, 240, Infinity];
export const CELLS = Object.entries(MOVES).flatMap(([k, [a, b]]) => DURS.map((D) => ({
  name: `${k} ${D === Infinity ? 'good' : D}`, D, gen: (rnd) => schedule(rnd, N, (t) => (t >= START && t < START + D ? b(t) : a(t))),
})));

export function runCell(ci, reps = REPS, seed = SEED) {
  const { name, D, gen } = CELLS[ci], rnd = makeRng(seed + 7919 * ci);
  let shipped = 0, both = 0, end = 0, share = [0, 0];
  for (let r = 0; r < reps; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v, { catchUp: { method: null } }), days = z.map((_, s) => s % 7);
    const s = u.changes.some((c) => c.direction === 'more often' && Math.abs(c.index - 1 - START) <= TOL);
    const g = s || guardedCandidates(v, days, GUARDS.half, { u }).some((q) => q.gain > pen(z.length, M) && Math.abs(q.a - START) <= TOL);
    if (D !== Infinity && u.changes.some((c) => c.direction === 'less often' && Math.abs(c.index - 1 - (START + D)) <= TOL)) end++;
    shipped += s; both += g;
    const inside = z.slice(START, Math.min(N, START + D)), before = z.slice(0, START);
    share[0] += before.reduce((a, b) => a + b, 0) / before.length; share[1] += inside.reduce((a, b) => a + b, 0) / inside.length;
  }
  return { name, D, shipped, both, end, before: share[0] / reps, inside: share[1] / reps };
}

// Part B: shares the documented schedule labels imply (Part A's model).
const PUB = { 'Wednesdays only': 1, 'Tue+Fri': 2, 'Mon/Wed/Fri': 3, 'Mon-Fri': 5, 'daily': 7 };
const implied = (label) => { const k = Object.keys(PUB).find((p) => label.startsWith(p)); return k ? ((7 - PUB[k]) * 0.95 + PUB[k] * 0.03) / 7 : NaN; };
export function sortEvent(drop, impliedDrop, nearCut) { return drop < 0.5 * impliedDrop ? 'N' : nearCut ? 'E' : 'C'; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  console.log(`PART A, seed ${SEED}, ${REPS} series a cell, n ${N + 1}; move to more days from step ${START} for D steps`);
  console.log('  cell             repeats before -> inside   start found: shipped alone   + guarded pass (half, m 3)   end found (shipped)');
  let h1 = true;
  for (let ci = 0; ci < CELLS.length; ci++) {
    const r = runCell(ci);
    if (r.shipped < 180) h1 = false;
    console.log(`  ${r.name.padEnd(14)}   ${(100 * r.before).toFixed(0).padStart(3)}% -> ${(100 * r.inside).toFixed(0).padStart(3)}%            ${String(r.shipped).padStart(5)}                  ${String(r.both).padStart(5)}                      ${r.D === Infinity ? '    -' : String(r.end).padStart(5)}`);
  }
  console.log(`\nH1 shipped alone finds the start in >= 180 of 200 in every cell: ${h1 ? 'pass' : 'FAIL'}`);
  const dir = process.argv[2] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (!existsSync(file)) { console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir}; Part B not run)`); process.exit(0); }
  const { readStates, SECONDARY } = await import('./update-rate-covid-schedules.mjs');
  const by = readStates(file), WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  console.log(`\nPART B (seen, descriptive): JHU's 8 documented 'more often' events; ${WIN} rows either side of the documented date`);
  const counts = { N: 0, E: 0, C: 0 };
  for (const e of SECONDARY.filter((x) => x.direction === 'more often')) {
    const x = by.get(e.state), z = repeatIndicators(x.values), days = daysFromDates(x.dates), u = updateRateChanges(x.values);
    const a = x.dates.indexOf(e.date), zi = a - 1; // z[zi] is the step into value a
    const part = (lo, hi) => { const s = z.slice(lo, hi); return s.reduce((p, q) => p + q, 0) / s.length; };
    const byDay = (lo, hi) => WD.map((_, d) => { let k = 0, m = 0; for (let s = lo; s < hi; s++) if (days[s] === d) { m++; k += z[s]; } return m ? Math.round((100 * k) / m) : NaN; });
    const bef = part(zi - WIN, zi), aft = part(zi, zi + WIN);
    const [from, to] = e.what.split(' -> '), iDrop = implied(from) - implied(to);
    const near = u.changes.filter((c) => c.direction === 'more often' && c.from <= a + NEAR && c.to >= a - NEAR);
    const cls = sortEvent(bef - aft, iDrop, near.length > 0);
    counts[cls]++;
    console.log(`${cls} ${e.state.padEnd(13)} ${e.date} ${e.what.padEnd(34)} repeats ${(100 * bef).toFixed(0).padStart(3)}% -> ${(100 * aft).toFixed(0).padStart(3)}% (schedules imply ${(100 * implied(from)).toFixed(0)}% -> ${(100 * implied(to)).toFixed(0)}%)`);
    console.log(`    by weekday before ${WD.map((d, i) => `${d} ${byDay(zi - WIN, zi)[i]}`).join(', ')}`);
    console.log(`    by weekday after  ${WD.map((d, i) => `${d} ${byDay(zi, zi + WIN)[i]}`).join(', ')}`);
    const st = u.stretches.filter((s) => s.to >= a - 120 && s.from <= a + 120);
    console.log(`    shipped stretches within 120 rows: ${st.map((s) => `${x.dates[s.from]}..${x.dates[s.to]} ${(100 * s.share).toFixed(0)}%`).join('; ')}`);
    if (near.length) console.log(`    'more often' cut within ${NEAR} rows: ${near.map((c) => `${x.dates[c.index]} [${x.dates[c.from]}..${x.dates[c.to]}]`).join(', ')}`);
  }
  console.log(`\nSorted: N (not in the data) ${counts.N}, E (cut elsewhere) ${counts.E}, C (in the data, not cut) ${counts.C}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
