// Pre-registered: a lower penalty for SHORT RETURNS to more frequent updates (update-rate.mjs shortReturns).
//
// Background (README "A provider's own schedule changes", 2026-11-18): the shipped check dated 20 of 27 US
// states' documented switches to weekly COVID-19 reporting, but 0 of 8 documented moves back to more days
// (Vermont, Arkansas, Alabama resumed daily publication in late summer 2021 for a few months). At the shipped
// penalty (2 x 2 log n per cut) two cuts around a two-month stretch do not pay. That round's "Next" asked for
// "a lower penalty for that direction, which would have to be pre-registered on simulated short returns first".
// This header, the cells, the rules and shortReturns() were committed before this file ran on any cell
// (shortReturns was run once on one hand-made toy series to check that it runs). The JHU series have been
// looked at (that round's D3), so the real check below is on SEEN data and can only keep or refuse the option.
//
// The pass: inside each stretch the shipped partition finds, the best single interval [a, b) (>= 20 steps,
// >= 20 steps either side) with fewer repeats than the rest of the stretch, the rest sharing ONE two-state
// chain (the old schedule resumed). Reported when the cost it saves exceeds m x 2 log(n + 1).
//   Candidates m in {0.5, 0.75, 1, 1.25, 1.5, 2}.
// NULL cells (no return), 200 series each; a false return is any return the pass reports:
//   B10, B25, B40, B60, M40, M60 (eval/update-rate-sim.mjs's chains) at n 300 and 600;
//   W5 n 1100: Monday-Friday publication, a weekend day repeats with p 0.95, a weekday with p 0.03;
//   W3 n 1100: Monday/Wednesday/Friday publication, same two probabilities;
//   W5c n 1100: daily (every day repeats with p 0.03) until step 550, then Monday-Friday for good (a lasting
//        change the partition should cut; a "return" reported on it is false).
// POWER cells, n 1100, Monday-Friday background (as W5), a return to daily publication (every day p 0.03)
// starting at step 500, 200 series each: R30, R60, R90 (30, 60, 90 steps long); I60: independent repeats
// 0.25 outside, 0.02 inside, 60 steps. FOUND = a reported return, or a shipped 'more often' change, starting
// within 10 steps of 500 (the JHU round's window). Counted for the shipped check alone and with the pass.
// Choice (calibration seed 20261218): the smallest m whose mean false returns are <= 0.010 a series in every
// null cell (the shipped check's own simulated budget). None: nothing ships, the README says so.
// Confirmation (seed 20261219, chosen m only), all must hold to offer the pass:
//   R1 every null cell: mean false returns <= 0.020 a series;
//   R2 R60 found (shipped + pass) >= 120 of 200;
//   R3 R60 found (shipped + pass) - found (shipped alone) >= 60.
// Real check (seen data, after R1-R3): JHU's 8 documented 'more often' secondary events
// (eval/update-rate-covid-schedules.mjs SECONDARY): J1 at least 4 of 8 dated (a return whose first day is in
// the event's +-10 day window); J2 descriptive, every return on the 27 primary states' series with its dates.
// Pass R1-R3 and J1: offered as an opt-in (`--short-returns`), never the default line, since J1 is seen data.
// usage: node eval/update-rate-returns.mjs [covid-data] > eval/update-rate-returns.out.txt
//
// ROUND 2 (written after round 1's file, before round 2 ran): round 1 failed its choice rule (no m in 0.5-2
// met 0.010 in every null cell; at m 2 the worst cells were W3 0.085, M60 n600 0.050, B60 n300 0.045). The max
// over every interval inside a stretch is a scan statistic, and a scan needs a larger penalty than one cut.
// Round 2 changes only the grid and the seeds: m in {2, 2.5, 3, 3.5, 4} (4 is the shipped two cuts' total),
// calibration seed 20261220, confirmation seed 20261221; cells, choice rule, R1-R3 and J1 unchanged.
// usage: node eval/update-rate-returns.mjs --round 2 [covid-data] > eval/update-rate-returns-2.out.txt
import { updateRateChanges, shortReturns } from '../update-rate.mjs';
import { makeRng, chain, NULLS } from './update-rate-sim.mjs';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROUND2 = process.argv.includes('--round') && process.argv[process.argv.indexOf('--round') + 1] === '2';
const ARGS = process.argv.slice(2).filter((a, i, A) => a !== '--round' && A[i - 1] !== '--round');
export const MULTS = ROUND2 ? [2, 2.5, 3, 3.5, 4] : [0.5, 0.75, 1, 1.25, 1.5, 2];
const [SEED_CAL, SEED_CON] = ROUND2 ? [20261220, 20261221] : [20261218, 20261219];
const START = 500, TOL = 10;

// Values from repeat indicators z (1 = repeat), so the shipped check sees the same series.
export function valuesFrom(z) { const v = [0]; for (const r of z) v.push(r ? v[v.length - 1] : v[v.length - 1] + 1); return v; }
// Publication schedule: pub(t) true on a publishing day; off days repeat with pOff, publishing days with pOn.
function schedule(rnd, n, pub, pOn = 0.03, pOff = 0.95) { const z = []; for (let t = 0; t < n; t++) z.push(rnd() < (pub(t) ? pOn : pOff) ? 1 : 0); return z; }
const MF = (t) => t % 7 < 5, MWF = (t) => t % 7 === 0 || t % 7 === 2 || t % 7 === 4, DAILY = () => true;

export const NULL_CELLS = {
  ...Object.fromEntries(Object.entries(NULLS).flatMap(([k, p]) => [300, 600].map((n) => [`${k} n${n}`, (rnd) => chain(rnd, n - 1, p)]))),
  'W5 n1100': (rnd) => schedule(rnd, 1099, MF),
  'W3 n1100': (rnd) => schedule(rnd, 1099, MWF),
  'W5c n1100': (rnd) => schedule(rnd, 1099, (t) => (t < 550 ? DAILY(t) : MF(t))),
};
const ret = (len) => (rnd) => schedule(rnd, 1099, (t) => (t >= START && t < START + len) || MF(t));
export const POWER_CELLS = {
  R30: ret(30), R60: ret(60), R90: ret(90),
  I60: (rnd) => Array.from({ length: 1099 }, (_, t) => (rnd() < (t >= START && t < START + 60 ? 0.02 : 0.25) ? 1 : 0)),
};

export function runSeed(seed, mults, reps = 200) {
  const rnd = makeRng(seed), out = { nulls: {}, power: {} };
  for (const [cell, gen] of Object.entries(NULL_CELLS)) {
    const f = mults.map(() => 0);
    for (let r = 0; r < reps; r++) {
      const v = valuesFrom(gen(rnd)), u = updateRateChanges(v);
      mults.forEach((m, i) => { f[i] += shortReturns(v, { mult: m, u }).returns.length; });
    }
    out.nulls[cell] = f.map((x) => x / reps);
  }
  for (const [cell, gen] of Object.entries(POWER_CELLS)) {
    let shipped = 0; const both = mults.map(() => 0);
    for (let r = 0; r < reps; r++) {
      const v = valuesFrom(gen(rnd)), u = updateRateChanges(v);
      // value index i is the step into values[i], z position i - 1; the return starts at z position START.
      const s = u.changes.some((c) => c.direction === 'more often' && Math.abs(c.index - 1 - START) <= TOL);
      if (s) shipped++;
      mults.forEach((m, i) => { if (s || shortReturns(v, { mult: m, u }).returns.some((q) => Math.abs(q.from - 1 - START) <= TOL)) both[i]++; });
    }
    out.power[cell] = { shipped, both };
  }
  return out;
}

function table(res, mults) {
  const L = [`  cell         ${mults.map((m) => `m ${m}`.padStart(8)).join('')}`];
  for (const [c, f] of Object.entries(res.nulls)) L.push(`  ${c.padEnd(12)} ${f.map((x) => x.toFixed(3).padStart(8)).join('')}`);
  for (const [c, p] of Object.entries(res.power)) L.push(`  ${(c + ' found').padEnd(12)} ${p.both.map((x) => String(x).padStart(8)).join('')}   (shipped alone ${p.shipped})`);
  return L.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  console.log(`CALIBRATION, seed ${SEED_CAL}: mean false returns a series (null cells), found of 200 (power cells)`);
  const cal = runSeed(SEED_CAL, MULTS);
  console.log(table(cal, MULTS));
  const ok = MULTS.findIndex((_, i) => Object.values(cal.nulls).every((f) => f[i] <= 0.010));
  if (ok < 0) { console.log(`\nNo m meets <= 0.010 in every null cell: nothing ships.\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`); process.exit(0); }
  const m = MULTS[ok];
  console.log(`\nSmallest m meeting <= 0.010 in every null cell: m ${m}`);
  console.log(`\nCONFIRMATION, seed ${SEED_CON}, chosen m only`);
  const con = runSeed(SEED_CON, [m]);
  console.log(table(con, [m]));
  const worst = Math.max(...Object.values(con.nulls).map((f) => f[0]));
  const r60 = con.power.R60;
  const R1 = worst <= 0.02, R2 = r60.both[0] >= 120, R3 = r60.both[0] - r60.shipped >= 60;
  console.log(`\nR1 every null cell <= 0.020 (worst ${worst.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 R60 found >= 120 (${r60.both[0]}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 R60 gain over shipped >= 60 (${r60.both[0] - r60.shipped}): ${R3 ? 'pass' : 'FAIL'}`);
  const dir = ARGS[0] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (R1 && R2 && R3 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file);
    const D = (s, i) => s.dates[Math.min(i, s.dates.length - 1)];
    console.log(`\nREAL (seen) check, JHU's 'more often' secondary events, m ${m}`);
    let dated = 0; const evs = SECONDARY.filter((e) => e.direction === 'more often');
    for (const e of evs) {
      const s = by.get(e.state), q = shortReturns(s.values, { mult: m }), [w0, w1] = eventWindow(s.dates, e);
      const hit = q.returns.find((x) => x.from >= w0 && x.from <= w1);
      if (hit) dated++;
      console.log(`${e.state.padEnd(14)} ${e.date} ${e.what.padEnd(30)} ${hit ? `DATED ${D(s, hit.from)}..${D(s, hit.to)} (${hit.steps} days), repeats ${(100 * hit.shareInside).toFixed(0)}% inside, ${(100 * hit.shareOutside).toFixed(0)}% around` : `missed${q.returns.length ? ` (returns at ${q.returns.map((x) => D(s, x.from)).join(', ')})` : ''}`}`);
    }
    console.log(`\nJ1 dated ${dated} of ${evs.length} (bar >= 4): ${dated >= 4 ? 'pass' : 'FAIL'}`);
    console.log('\nJ2 (descriptive) every return on the 27 primary states');
    for (const st of [...new Set(PRIMARY.map((e) => e.state))]) {
      const s = by.get(st), q = shortReturns(s.values, { mult: m });
      for (const x of q.returns) console.log(`  ${st.padEnd(21)} ${D(s, x.from)}..${D(s, x.to)} (${x.steps} days) ${(100 * x.shareInside).toFixed(0)}% inside, ${(100 * x.shareOutside).toFixed(0)}% around, gain ${x.gain.toFixed(1)} vs ${q.penalty.toFixed(1)}`);
    }
  } else if (R1 && R2 && R3) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
