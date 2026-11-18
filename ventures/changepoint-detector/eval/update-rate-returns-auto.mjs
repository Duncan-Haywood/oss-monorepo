// Pre-registered (round 4 of the short-returns pass): the return model CHOSEN PER STRETCH by a weekly-pattern test.
//
// Background (README "Short returns, with the day of the week", 2026-11-18, eval/update-rate-returns-dow.mjs):
// round 3 found that the weekday cost 'dow' has the power (199 of 200 sixty-day returns at m 3 to 5) but fails
// the null budget on clumpy chains with no weekly schedule (M60 n600 0.020 false returns a series even at m 6),
// while 'dowchain' holds every null at m 5 but finds only 123 (calibration) and 116 (confirmation, bar 120).
// That section's "Next": "choosing the model per stretch rather than one cost for all: the weekday cost where the
// stretch shows a weekly pattern, the chain where it does not. Pre-registered on fresh seeds, with these cells."
// This header, the cells, the rules and weeklyPatternLR() / WEEKLY_TEST in update-rate.mjs were committed before
// this file ran on any cell (weeklyPatternLR was run once on round 3's test toy, a Monday-Friday schedule with a
// planted daily stretch, LR 669.7, and on one deterministic aperiodic series, LR 0.5, to check it runs).
//
// The test, per shipped stretch z[L..R): LR = 2 x (log likelihood of a two-state chain per weekday, 14
// parameters, minus that of one two-state chain, 2) over the stretch's transitions; about chi-square(12) under a
// chain with no weekly pattern. LR > 32.909 (the chi-square(12) 0.999 quantile, fixed here, not tuned): the stretch
// is weekly and its best return is scored with 'dow'; otherwise with the FALLBACK cost. The return pass itself is
// round 3's (bestReturnCost: best interval [a, b) inside the stretch, >= 20 steps, >= 20 either side, fewer repeats
// inside, reported when its gain beats m x 2 log(n + 1)); only the cost used in each stretch changes.
// Two arms, by fallback: 'dow|chain' (round 2's chain, 2 parameters a region) and 'dow|dowchain' (round 3's).
//   Candidates m in {2, 2.5, 3, 3.5, 4, 5, 6}.
// Cells: exactly rounds 1-3's NULL_CELLS (15) and POWER_CELLS (R30, R60, R90, I60), 200 series each, FOUND as
// there (a reported return, or a shipped 'more often' change, starting within 10 steps of 500). Seeding as round 3
// (cell i draws from makeRng(seed + 7919 i)), with fresh seeds: calibration 20261224, confirmation 20261225.
// Choice (calibration): per arm, the smallest m whose mean false returns are <= 0.010 a series in every null cell;
// among arms that have one, the larger R60 found at its m (a tie goes to 'dow|chain', fewer parameters). None:
// nothing ships, the README says so.
// Confirmation (chosen arm and m only), all must hold to offer the pass:
//   R1 every null cell: mean false returns <= 0.020 a series;
//   R2 R60 found (shipped + pass) >= 120 of 200;
//   R3 R60 found (shipped + pass) - found (shipped alone) >= 60.
// Real check (seen data, after R1-R3): JHU's 8 documented 'more often' secondary events, weekday from each row's
// date: J1 at least 4 of 8 dated (a return whose first day is in the event's +-10 day window); J2 descriptive,
// every return on the 27 primary states' series, with each stretch's LR and cost.
// Pass R1-R3 and J1: offered as an opt-in (module option), never the default line (J1 is seen data).
// Descriptive only (decides nothing): the share of stretches read as weekly in each cell, and round 3's single
// costs ('dow', 'dowchain') at the chosen m on the confirmation series.
// usage: node eval/update-rate-returns-auto.mjs [covid-data] > eval/update-rate-returns-auto.out.txt
import { updateRateChanges, returnCandidates, daysFromDates, repeatIndicators, weeklyPatternLR, WEEKLY_TEST } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { NULL_CELLS, POWER_CELLS, valuesFrom } from './update-rate-returns.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';

export const MULTS = [2, 2.5, 3, 3.5, 4, 5, 6];
export const ARMS = { 'dow|chain': 'chain', 'dow|dowchain': 'dowchain' };
const KINDS = ['dow', 'chain', 'dowchain'];
const SEED_CAL = 20261224, SEED_CON = 20261225, START = 500, TOL = 10, REPS = 200;
const CELLS = [...Object.keys(NULL_CELLS), ...Object.keys(POWER_CELLS)];
const pen = (n, m) => m * 2 * Math.log(n + 1);

/** Per stretch, the chosen kind under an arm's fallback; candidates keyed by stretch start L. */
export function autoCandidates(values, days, fallback, { u = null, cand = null } = {}) {
  const z = repeatIndicators(values);
  u = u || updateRateChanges(values);
  const pick = (k) => (cand ? cand[k] : returnCandidates(values, { kind: k, days, u }));
  const D = new Map(pick('dow').map((q) => [q.L, q])), F = new Map(pick(fallback).map((q) => [q.L, q]));
  const out = [];
  for (const L of new Set([...D.keys(), ...F.keys()])) {
    const q = D.get(L) || F.get(L), lr = weeklyPatternLR(z, days, q.L, q.R), weekly = lr > WEEKLY_TEST.crit;
    const c = weekly ? D.get(L) : F.get(L);
    if (c) out.push({ ...c, lr, weekly, kind: weekly ? 'dow' : fallback });
  }
  return out;
}

export function runCell(seed, ci, kinds, reps = REPS) {
  const name = CELLS[ci], gen = NULL_CELLS[name] || POWER_CELLS[name], rnd = makeRng(seed + 7919 * ci), rows = [];
  for (let r = 0; r < reps; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v), days = z.map((_, s) => s % 7);
    const shipped = u.changes.some((c) => c.direction === 'more often' && Math.abs(c.index - 1 - START) <= TOL);
    const cand = Object.fromEntries(kinds.map((k) => [k, returnCandidates(v, { kind: k, days, u })]));
    const arms = {};
    for (const [arm, fb] of Object.entries(ARMS)) if (cand[fb] && cand.dow) arms[arm] = autoCandidates(v, days, fb, { u, cand }).map((q) => ({ a: q.a, gain: q.gain, weekly: q.weekly }));
    const single = Object.fromEntries(kinds.map((k) => [k, cand[k].map((q) => ({ a: q.a, gain: q.gain }))]));
    rows.push({ n: z.length, shipped, cand: { ...single, ...arms } });
  }
  return { name, rows };
}

function summarise(cells, key, m) {
  const out = { nulls: {}, power: {}, weekly: {} };
  for (const { name, rows } of cells) {
    const all = rows.flatMap((x) => x.cand[key]);
    out.weekly[name] = all.length && 'weekly' in all[0] ? all.filter((q) => q.weekly).length / all.length : null;
    if (NULL_CELLS[name]) out.nulls[name] = rows.reduce((s, x) => s + x.cand[key].filter((q) => q.gain > pen(x.n, m)).length, 0) / rows.length;
    else out.power[name] = {
      shipped: rows.filter((x) => x.shipped).length,
      both: rows.filter((x) => x.shipped || x.cand[key].some((q) => q.gain > pen(x.n, m) && Math.abs(q.a - START) <= TOL)).length,
    };
  }
  return out;
}

function table(cells, key, mults) {
  const S = mults.map((m) => summarise(cells, key, m)), wk = S[0].weekly, hasW = Object.values(wk).some((w) => w !== null);
  const L = [`  cell         ${mults.map((m) => `m ${m}`.padStart(8)).join('')}${hasW ? '   weekly share of stretches' : ''}`];
  const w = (c) => (hasW ? `   ${wk[c] === null ? '-' : wk[c].toFixed(3)}` : '');
  for (const c of Object.keys(S[0].nulls)) L.push(`  ${c.padEnd(12)} ${S.map((s) => s.nulls[c].toFixed(3).padStart(8)).join('')}${w(c)}`);
  for (const c of Object.keys(S[0].power)) L.push(`  ${(c + ' found').padEnd(12)} ${S.map((s) => String(s.power[c].both).padStart(8)).join('')}   (shipped alone ${S[0].power[c].shipped})${w(c)}`);
  return L.join('\n');
}

function runAll(seed, kinds) {
  const W = Math.min(availableParallelism(), CELLS.length), queue = CELLS.map((_, i) => i), res = new Array(CELLS.length);
  return new Promise((done, fail) => {
    let live = 0;
    const next = (w) => {
      if (!queue.length) { w.terminate(); if (--live === 0) done(res); return; }
      w.postMessage({ seed, ci: queue.shift(), kinds });
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
  parentPort.on('message', ({ seed, ci, kinds }) => parentPort.postMessage({ ci, out: runCell(seed, ci, kinds) }));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const cal = await runAll(SEED_CAL, KINDS);
  const pick = {};
  for (const arm of Object.keys(ARMS)) {
    console.log(`CALIBRATION, seed ${SEED_CAL}, arm '${arm}' (LR > ${WEEKLY_TEST.crit}: 'dow'): mean false returns a series (null cells), found of 200 (power cells)`);
    console.log(table(cal, arm, MULTS));
    const i = MULTS.findIndex((m) => Object.values(summarise(cal, arm, m).nulls).every((f) => f <= 0.010));
    pick[arm] = i < 0 ? null : { m: MULTS[i], r60: summarise(cal, arm, MULTS[i]).power.R60.both };
    console.log(pick[arm] ? `\n'${arm}': smallest m meeting <= 0.010 in every null cell: m ${pick[arm].m} (R60 found ${pick[arm].r60})\n` : `\n'${arm}': no m meets <= 0.010 in every null cell\n`);
  }
  const ok = Object.keys(ARMS).filter((a) => pick[a]);
  if (!ok.length) { console.log(`No arm has an m meeting the null budget: nothing ships.\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`); process.exit(0); }
  const arm = ok.reduce((b, a) => (pick[a].r60 > pick[b].r60 ? a : b), ok[0]), m = pick[arm].m, fb = ARMS[arm];
  console.log(`Chosen: arm '${arm}', m ${m}`);
  console.log(`\nCONFIRMATION, seed ${SEED_CON}, chosen arm and m only`);
  const con = await runAll(SEED_CON, KINDS);
  console.log(table(con, arm, [m]));
  const s = summarise(con, arm, m), worst = Math.max(...Object.values(s.nulls)), r60 = s.power.R60;
  const R1 = worst <= 0.02, R2 = r60.both >= 120, R3 = r60.both - r60.shipped >= 60;
  console.log(`\nR1 every null cell <= 0.020 (worst ${worst.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 R60 found >= 120 (${r60.both}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 R60 gain over shipped >= 60 (${r60.both - r60.shipped}): ${R3 ? 'pass' : 'FAIL'}`);
  for (const k of ['dow', 'dowchain']) console.log(`\nReference (descriptive), single cost '${k}' at m ${m}, confirmation series:\n${table(con, k, [m])}`);
  const args = process.argv.slice(2), dir = args[0] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (R1 && R2 && R3 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file);
    const D = (x, i) => x.dates[Math.min(i, x.dates.length - 1)];
    const found = (x) => { const days = daysFromDates(x.dates), n = x.values.length - 1; return autoCandidates(x.values, days, fb).filter((q) => q.gain > pen(n, m)).map((q) => ({ ...q, from: q.a + 1, to: q.b, steps: q.b - q.a })); };
    console.log(`\nREAL (seen) check, JHU's 'more often' secondary events, arm '${arm}', m ${m}`);
    let dated = 0; const evs = SECONDARY.filter((e) => e.direction === 'more often');
    for (const e of evs) {
      const x = by.get(e.state), q = found(x), [w0, w1] = eventWindow(x.dates, e);
      const hit = q.find((r) => r.from >= w0 && r.from <= w1);
      if (hit) dated++;
      console.log(`${e.state.padEnd(14)} ${e.date} ${e.what.padEnd(34)} ${hit ? `DATED ${D(x, hit.from)}..${D(x, hit.to)} (${hit.steps} days, ${hit.kind}, LR ${hit.lr.toFixed(1)}), repeats ${(100 * hit.shareInside).toFixed(0)}% inside, ${(100 * hit.shareOutside).toFixed(0)}% around` : `missed${q.length ? ` (returns at ${q.map((r) => D(x, r.from)).join(', ')})` : ''}`}`);
    }
    console.log(`\nJ1 dated ${dated} of ${evs.length} (bar >= 4): ${dated >= 4 ? 'pass' : 'FAIL'}`);
    console.log('\nJ2 (descriptive) every return on the 27 primary states');
    for (const st of [...new Set(PRIMARY.map((e) => e.state))]) {
      const x = by.get(st);
      for (const r of found(x)) console.log(`  ${st.padEnd(21)} ${D(x, r.from)}..${D(x, r.to)} (${r.steps} days, ${r.kind}, LR ${r.lr.toFixed(1)}) ${(100 * r.shareInside).toFixed(0)}% inside, ${(100 * r.shareOutside).toFixed(0)}% around, gain ${r.gain.toFixed(1)} vs ${pen(x.values.length - 1, m).toFixed(1)}`);
    }
  } else if (R1 && R2 && R3) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
