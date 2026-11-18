// Pre-registered (round 3 of the short-returns pass): a DAY-OF-WEEK repeat cost (update-rate.mjs bestReturnCost).
//
// Background (README "Short returns to more frequent updates", 2026-11-18): rounds 1 and 2 of the short-returns
// pass (eval/update-rate-returns.mjs) failed. At the null budget (m 3) a 60-day return to daily publication inside
// Monday-Friday publication was found in 0 of 200 series. The binding null cell in both rounds was W3 (Mon/Wed/Fri
// publication): the pass's two-state chain ignores the calendar, so a fixed weekly schedule looks like clumps. That
// section's "Next": "a day-of-week repeat cost (one repeat probability per weekday in each stretch, for daily series
// with dates), pre-registered on the same cells". This header, the cells, the rules and bestReturnCost() were
// committed before this file ran on any cell (bestReturnCost was run once on round 2's test toy series, a
// deterministic Monday-Friday schedule with a planted daily stretch, to check that it runs and that its 'chain'
// kind reproduces bestReturn's gain).
//
// The pass is round 2's (best interval [a, b) inside each shipped stretch, >= 20 steps, >= 20 either side, fewer
// repeats inside; the parts before and after share one model; reported when its gain beats m x 2 log(n + 1)), with
// the region model replaced by one of two costs:
//   'dow':      one repeat probability per weekday in each region (7 inside, 7 shared outside);
//   'dowchain': a two-state chain per weekday (P(repeat | weekday, last step repeated or not), 14 per region).
// Weekday of repeat indicator s in simulation: s mod 7 (the schedules below publish on s mod 7 < 5, etc.).
//   Candidates m in {2, 2.5, 3, 3.5, 4, 5, 6}.
// Cells: exactly rounds 1 and 2's NULL_CELLS (15) and POWER_CELLS (R30, R60, R90, I60), 200 series each,
// FOUND as there (a reported return, or a shipped 'more often' change, starting within 10 steps of 500).
// Seeding differs (to run cells in parallel): cell i of the list draws from makeRng(seed + 7919 i), and both costs
// see the same series. Calibration seed 20261222, confirmation seed 20261223.
// Choice (calibration): per cost, the smallest m whose mean false returns are <= 0.010 a series in every null cell;
// among costs that have one, the larger R60 found at its m (a tie goes to 'dow', fewer parameters). None: nothing
// ships, the README says so.
// Confirmation (chosen cost and m only), all must hold to offer the pass:
//   R1 every null cell: mean false returns <= 0.020 a series;
//   R2 R60 found (shipped + pass) >= 120 of 200;
//   R3 R60 found (shipped + pass) - found (shipped alone) >= 60.
// Real check (seen data, after R1-R3): JHU's 8 documented 'more often' secondary events, weekday from each row's
// date: J1 at least 4 of 8 dated (a return whose first day is in the event's +-10 day window); J2 descriptive,
// every return on the 27 primary states' series.
// Pass R1-R3 and J1: offered as an opt-in, never the default line (J1 is seen data).
// Descriptive only (decides nothing): round 2's 'chain' cost at m 3 on the same series, as a reference column.
// usage: node eval/update-rate-returns-dow.mjs [covid-data] > eval/update-rate-returns-dow.out.txt
import { updateRateChanges, returnCandidates, daysFromDates } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { NULL_CELLS, POWER_CELLS, valuesFrom } from './update-rate-returns.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';

export const MULTS = [2, 2.5, 3, 3.5, 4, 5, 6];
export const COSTS = ['dow', 'dowchain'];
const REF = { kind: 'chain', mult: 3 };
const SEED_CAL = 20261222, SEED_CON = 20261223, START = 500, TOL = 10, REPS = 200;
const CELLS = [...Object.keys(NULL_CELLS), ...Object.keys(POWER_CELLS)];
const pen = (n, m) => m * 2 * Math.log(n + 1);

// One cell: per series, the best gain per stretch for every cost (penalties applied later), the shipped check's
// hit, and the candidates' start positions.
export function runCell(seed, ci, costs, reps = REPS) {
  const name = CELLS[ci], gen = NULL_CELLS[name] || POWER_CELLS[name], rnd = makeRng(seed + 7919 * ci), rows = [];
  for (let r = 0; r < reps; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v), days = z.map((_, s) => s % 7);
    const shipped = u.changes.some((c) => c.direction === 'more often' && Math.abs(c.index - 1 - START) <= TOL);
    const cand = Object.fromEntries([...costs, REF.kind].map((k) => [k, returnCandidates(v, { kind: k, days, u }).map((q) => ({ a: q.a, gain: q.gain }))]));
    rows.push({ n: z.length, shipped, cand });
  }
  return { name, rows };
}

function summarise(cells, kind, m) {
  const out = { nulls: {}, power: {} };
  for (const { name, rows } of cells) {
    if (NULL_CELLS[name]) out.nulls[name] = rows.reduce((s, x) => s + x.cand[kind].filter((q) => q.gain > pen(x.n, m)).length, 0) / rows.length;
    else out.power[name] = {
      shipped: rows.filter((x) => x.shipped).length,
      both: rows.filter((x) => x.shipped || x.cand[kind].some((q) => q.gain > pen(x.n, m) && Math.abs(q.a - START) <= TOL)).length,
    };
  }
  return out;
}

function table(cells, kind, mults) {
  const S = mults.map((m) => summarise(cells, kind, m)), L = [`  cell         ${mults.map((m) => `m ${m}`.padStart(8)).join('')}`];
  for (const c of Object.keys(S[0].nulls)) L.push(`  ${c.padEnd(12)} ${S.map((s) => s.nulls[c].toFixed(3).padStart(8)).join('')}`);
  for (const c of Object.keys(S[0].power)) L.push(`  ${(c + ' found').padEnd(12)} ${S.map((s) => String(s.power[c].both).padStart(8)).join('')}   (shipped alone ${S[0].power[c].shipped})`);
  return L.join('\n');
}

function runAll(seed, costs) {
  const W = Math.min(availableParallelism(), CELLS.length), queue = CELLS.map((_, i) => i), res = new Array(CELLS.length);
  return new Promise((done, fail) => {
    let live = 0;
    const next = (w) => {
      if (!queue.length) { w.terminate(); if (--live === 0) done(res); return; }
      w.postMessage({ seed, ci: queue.shift(), costs });
    };
    for (let i = 0; i < W; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { worker: true } });
      live++;
      w.on('message', (msg) => { res[msg.ci] = msg.out; next(w); });
      w.on('error', fail);
      next(w);
    }
  });
}

if (!isMainThread && workerData?.worker) {
  parentPort.on('message', ({ seed, ci, costs }) => parentPort.postMessage({ ci, out: runCell(seed, ci, costs) }));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const cal = await runAll(SEED_CAL, COSTS);
  const pick = {};
  for (const k of COSTS) {
    console.log(`CALIBRATION, seed ${SEED_CAL}, cost '${k}': mean false returns a series (null cells), found of 200 (power cells)`);
    console.log(table(cal, k, MULTS));
    const i = MULTS.findIndex((m) => Object.values(summarise(cal, k, m).nulls).every((f) => f <= 0.010));
    pick[k] = i < 0 ? null : { m: MULTS[i], r60: summarise(cal, k, MULTS[i]).power.R60.both };
    console.log(pick[k] ? `\n'${k}': smallest m meeting <= 0.010 in every null cell: m ${pick[k].m} (R60 found ${pick[k].r60})\n` : `\n'${k}': no m meets <= 0.010 in every null cell\n`);
  }
  console.log(`Reference (descriptive), round 2's 'chain' cost at m ${REF.mult} on the same series:\n${table(cal, REF.kind, [REF.mult])}\n`);
  const ok = COSTS.filter((k) => pick[k]);
  if (!ok.length) { console.log(`No cost has an m meeting the null budget: nothing ships.\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`); process.exit(0); }
  const kind = ok.reduce((b, k) => (pick[k].r60 > pick[b].r60 ? k : b), ok[0]), m = pick[kind].m;
  console.log(`Chosen: cost '${kind}', m ${m}`);
  console.log(`\nCONFIRMATION, seed ${SEED_CON}, chosen cost and m only`);
  const con = await runAll(SEED_CON, [kind]);
  console.log(table(con, kind, [m]));
  const s = summarise(con, kind, m), worst = Math.max(...Object.values(s.nulls)), r60 = s.power.R60;
  const R1 = worst <= 0.02, R2 = r60.both >= 120, R3 = r60.both - r60.shipped >= 60;
  console.log(`\nR1 every null cell <= 0.020 (worst ${worst.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 R60 found >= 120 (${r60.both}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 R60 gain over shipped >= 60 (${r60.both - r60.shipped}): ${R3 ? 'pass' : 'FAIL'}`);
  console.log(`\nReference (descriptive), 'chain' at m ${REF.mult}, confirmation series:\n${table(await runAll(SEED_CON, []), REF.kind, [REF.mult])}`);
  const args = process.argv.slice(2), dir = args[0] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (R1 && R2 && R3 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file);
    const D = (x, i) => x.dates[Math.min(i, x.dates.length - 1)];
    const found = (x) => { const days = daysFromDates(x.dates), n = x.values.length - 1; return returnCandidates(x.values, { kind, days }).filter((q) => q.gain > pen(n, m)).map((q) => ({ ...q, from: q.a + 1, to: q.b, steps: q.b - q.a })); };
    console.log(`\nREAL (seen) check, JHU's 'more often' secondary events, cost '${kind}', m ${m}`);
    let dated = 0; const evs = SECONDARY.filter((e) => e.direction === 'more often');
    for (const e of evs) {
      const x = by.get(e.state), q = found(x), [w0, w1] = eventWindow(x.dates, e);
      const hit = q.find((r) => r.from >= w0 && r.from <= w1);
      if (hit) dated++;
      console.log(`${e.state.padEnd(14)} ${e.date} ${e.what.padEnd(34)} ${hit ? `DATED ${D(x, hit.from)}..${D(x, hit.to)} (${hit.steps} days), repeats ${(100 * hit.shareInside).toFixed(0)}% inside, ${(100 * hit.shareOutside).toFixed(0)}% around` : `missed${q.length ? ` (returns at ${q.map((r) => D(x, r.from)).join(', ')})` : ''}`}`);
    }
    console.log(`\nJ1 dated ${dated} of ${evs.length} (bar >= 4): ${dated >= 4 ? 'pass' : 'FAIL'}`);
    console.log('\nJ2 (descriptive) every return on the 27 primary states');
    for (const st of [...new Set(PRIMARY.map((e) => e.state))]) {
      const x = by.get(st);
      for (const r of found(x)) console.log(`  ${st.padEnd(21)} ${D(x, r.from)}..${D(x, r.to)} (${r.steps} days) ${(100 * r.shareInside).toFixed(0)}% inside, ${(100 * r.shareOutside).toFixed(0)}% around, gain ${r.gain.toFixed(1)} vs ${pen(x.values.length - 1, m).toFixed(1)}`);
    }
  } else if (R1 && R2 && R3) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
