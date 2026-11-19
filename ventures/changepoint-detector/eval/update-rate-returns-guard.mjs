// Pre-registered (round 5 of the short-returns pass): SAME-COUNT DAY-SHIFT nulls and a DIRECTION GUARD that asks
// for a real drop in repeats.
//
// Background (README "Short returns: the model chosen per stretch", 2026-11-18, eval/update-rate-returns-auto.mjs):
// round 4's pass ('dow|chain' at m 3: the weekday cost on stretches a 14- vs 2-parameter chain test reads as weekly,
// round 2's chain elsewhere) passed R1-R3 in simulation, then dated 3 of JHU's 8 documented returns (J1 bar 4). Its
// J2 list showed five of twelve returns with about the same repeat share inside as around (Alaska 2022, Michigan
// 2022, Utah's 20 days 85%/85%, Alabama 2022 86%/86%): changes in WHICH days publish, not returns to more frequent
// publication. The weekday cost gains from any change of weekday pattern, the pass's only direction rule was "fewer
// repeats inside" (a hair fewer passes), and no simulated null moved publication between two sets of days of the
// same size. That section's "Next": "a null cell that keeps the count of publication days and moves them
// (Tuesday/Friday to Monday/Thursday, and Wednesday to Monday), and a direction guard that asks for a real drop in
// repeats ... Then J1 again. It is now seen twice, so it can only confirm, not choose."
//
// Written, with returnGuardPasses() and the `guard` option of bestReturnCost/returnCandidates in update-rate.mjs,
// before this file ran on any cell. Disclosure: round 4's J2 shares (printed above in its .out.txt) were read when
// the guards were written. On those shares Michigan 2021's documented return (58% inside, 66% around) fails the
// 'half' guard; that is why the choice between guards below is made on simulation only, and J1 can only refuse.
//
// The guard replaces the pass's "fewer repeats inside" test INSIDE the search: the best interval is taken among
// those that pass it (so a different interval can win, not only drop out). Two guards:
//   'half': repeat share inside <= 0.5 x share around (the README's example, fixed);
//   'z01':  one-sided pooled two-proportion z of (share around - share inside) >= 2.326 (alpha 0.01).
// Everything else is round 4's: per shipped stretch, the weekly-pattern test (LR > 32.909) picks 'dow', else
// 'chain'; interval >= 20 steps, >= 20 either side; reported when gain > m x 2 log(n + 1). The 'none' guard (round
// 4 exactly) runs beside them as a reference and decides nothing.
// Cells: rounds 1-4's 15 NULL_CELLS and 4 POWER_CELLS, plus four SHIFT null cells, n 1100, same probabilities
// (a publishing day repeats with p 0.03, any other with p 0.95; day labels t % 7, 0 = Monday as in MF):
//   S2t: Tuesday/Friday, Monday/Thursday for 60 steps from 500, then Tuesday/Friday again;
//   S1t: Wednesday only, Monday only for 60 steps from 500, then Wednesday again;
//   S2p: Tuesday/Friday until 550, then Monday/Thursday for good;
//   S1p: Wednesday only until 550, then Monday only for good.
// A return reported on a shift cell is false. 200 series a cell; FOUND as rounds 1-4. Seeding as round 3-4 (cell i
// draws from makeRng(seed + 7919 i), cells in the order: nulls, shifts, powers), fresh seeds: calibration 20261226,
// confirmation 20261227.
// Choice (calibration): per guard, the smallest m in {3, 3.5, 4, 5, 6} whose mean false returns are <= 0.010 a
// series in every null and shift cell; among guards that have one, the larger R30 + R60 found at its m (a tie goes
// to 'half', the simpler). None: nothing ships.
// Confirmation (chosen guard and m only), all must hold to offer the pass:
//   R1 every null and shift cell: mean false returns <= 0.020 a series;
//   R2 R60 found (shipped + pass) >= 120 of 200;
//   R3 R60 found (shipped + pass) - found (shipped alone) >= 60;
//   R4 every shift cell: mean false returns <= 0.010 a series.
// Real check (seen data, after R1-R4): JHU's 8 documented 'more often' events, J1 at least 4 of 8 dated (a return
// whose first day is in the event's +-10 day window); J2 descriptive, every return on the 27 primary states. J1 is
// seen for the third time, so a pass only keeps the option eligible as an opt-in, never the default line.
// usage: node eval/update-rate-returns-guard.mjs [covid-data] > eval/update-rate-returns-guard.out.txt
import { updateRateChanges, returnCandidates, daysFromDates, repeatIndicators, weeklyPatternLR, WEEKLY_TEST } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { NULL_CELLS, POWER_CELLS, valuesFrom } from './update-rate-returns.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';

export const MULTS = [3, 3.5, 4, 5, 6];
export const GUARDS = { none: null, half: { kind: 'ratio', r: 0.5 }, z01: { kind: 'z', z: 2.326 } };
const CHOOSE = ['half', 'z01'];
const SEED_CAL = 20261226, SEED_CON = 20261227, START = 500, TOL = 10, REPS = Number(process.env.REPS_SMOKE) || 200;

function schedule(rnd, n, pub, pOn = 0.03, pOff = 0.95) { const z = []; for (let t = 0; t < n; t++) z.push(rnd() < (pub(t) ? pOn : pOff) ? 1 : 0); return z; }
const on = (...d) => (t) => d.includes(t % 7);
const TF = on(1, 4), MTh = on(0, 3), WED = on(2), MON = on(0);
const temp = (a, b) => (t) => (t >= START && t < START + 60 ? b(t) : a(t));
const perm = (a, b) => (t) => (t < 550 ? a(t) : b(t));
export const SHIFT_CELLS = {
  'S2t n1100': (rnd) => schedule(rnd, 1099, temp(TF, MTh)),
  'S1t n1100': (rnd) => schedule(rnd, 1099, temp(WED, MON)),
  'S2p n1100': (rnd) => schedule(rnd, 1099, perm(TF, MTh)),
  'S1p n1100': (rnd) => schedule(rnd, 1099, perm(WED, MON)),
};
const NULLS_ALL = { ...NULL_CELLS, ...SHIFT_CELLS };
const CELLS = [...Object.keys(NULLS_ALL), ...Object.keys(POWER_CELLS)];
const pen = (n, m) => m * 2 * Math.log(n + 1);

/**
 * Round 4's per-stretch choice ('dow' if the stretch reads as weekly, else 'chain'; the same rule as
 * eval/update-rate-returns-auto.mjs autoCandidates, copied because importing that file would also install its
 * worker handler in these workers) with a direction guard inside the search.
 */
export function guardedCandidates(values, days, guard, { u = null } = {}) {
  u = u || updateRateChanges(values);
  const z = repeatIndicators(values);
  const D = new Map(returnCandidates(values, { kind: 'dow', days, u, guard }).map((q) => [q.L, q]));
  const F = new Map(returnCandidates(values, { kind: 'chain', days, u, guard }).map((q) => [q.L, q]));
  const out = [];
  for (const L of new Set([...D.keys(), ...F.keys()])) {
    const q = D.get(L) || F.get(L), lr = weeklyPatternLR(z, days, q.L, q.R), weekly = lr > WEEKLY_TEST.crit;
    const c = weekly ? D.get(L) : F.get(L);
    if (c) out.push({ ...c, lr, weekly, kind: weekly ? 'dow' : 'chain' });
  }
  return out;
}

export function runCell(seed, ci, reps = REPS) {
  const name = CELLS[ci], gen = NULLS_ALL[name] || POWER_CELLS[name], rnd = makeRng(seed + 7919 * ci), rows = [];
  for (let r = 0; r < reps; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v), days = z.map((_, s) => s % 7);
    const shipped = u.changes.some((c) => c.direction === 'more often' && Math.abs(c.index - 1 - START) <= TOL);
    const cand = Object.fromEntries(Object.entries(GUARDS).map(([g, gd]) => [g, guardedCandidates(v, days, gd, { u }).map((q) => ({ a: q.a, gain: q.gain }))]));
    rows.push({ n: z.length, shipped, cand });
  }
  return { name, rows };
}

function summarise(cells, key, m) {
  const out = { nulls: {}, power: {} };
  for (const { name, rows } of cells) {
    if (NULLS_ALL[name]) out.nulls[name] = rows.reduce((s, x) => s + x.cand[key].filter((q) => q.gain > pen(x.n, m)).length, 0) / rows.length;
    else out.power[name] = {
      shipped: rows.filter((x) => x.shipped).length,
      both: rows.filter((x) => x.shipped || x.cand[key].some((q) => q.gain > pen(x.n, m) && Math.abs(q.a - START) <= TOL)).length,
    };
  }
  return out;
}

function table(cells, key, mults) {
  const S = mults.map((m) => summarise(cells, key, m));
  const L = [`  cell         ${mults.map((m) => `m ${m}`.padStart(8)).join('')}`];
  for (const c of Object.keys(S[0].nulls)) L.push(`  ${c.padEnd(12)} ${S.map((s) => s.nulls[c].toFixed(3).padStart(8)).join('')}`);
  for (const c of Object.keys(S[0].power)) L.push(`  ${(c + ' found').padEnd(12)} ${S.map((s) => String(s.power[c].both).padStart(8)).join('')}   (shipped alone ${S[0].power[c].shipped})`);
  return L.join('\n');
}

function runAll(seed) {
  const W = Math.min(availableParallelism(), CELLS.length), queue = CELLS.map((_, i) => i), res = new Array(CELLS.length);
  return new Promise((done, fail) => {
    let live = 0;
    const next = (w) => {
      if (!queue.length) { w.terminate(); if (--live === 0) done(res); return; }
      w.postMessage({ seed, ci: queue.shift() });
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
  parentPort.on('message', ({ seed, ci }) => parentPort.postMessage({ ci, out: runCell(seed, ci) }));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const cal = await runAll(SEED_CAL);
  const pick = {};
  for (const g of Object.keys(GUARDS)) {
    console.log(`CALIBRATION, seed ${SEED_CAL}, guard '${g}'${g === 'none' ? ' (round 4 exactly; reference, decides nothing)' : ''}: mean false returns a series (null and shift cells), found of 200 (power cells)`);
    console.log(table(cal, g, MULTS));
    const i = MULTS.findIndex((m) => Object.values(summarise(cal, g, m).nulls).every((f) => f <= 0.010));
    if (!CHOOSE.includes(g)) { console.log(''); continue; }
    const p = i < 0 ? null : summarise(cal, g, MULTS[i]).power;
    pick[g] = i < 0 ? null : { m: MULTS[i], score: p.R30.both + p.R60.both };
    console.log(pick[g] ? `\n'${g}': smallest m meeting <= 0.010 in every null and shift cell: m ${pick[g].m} (R30 + R60 found ${pick[g].score})\n` : `\n'${g}': no m meets <= 0.010 in every null and shift cell\n`);
  }
  const ok = CHOOSE.filter((g) => pick[g]);
  if (!ok.length) { console.log(`No guard has an m meeting the null budget: nothing ships.\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`); process.exit(0); }
  const g = ok.reduce((b, a) => (pick[a].score > pick[b].score ? a : b), ok[0]), m = pick[g].m;
  console.log(`Chosen: guard '${g}', m ${m}`);
  console.log(`\nCONFIRMATION, seed ${SEED_CON}, chosen guard and m only`);
  const con = await runAll(SEED_CON);
  console.log(table(con, g, [m]));
  const s = summarise(con, g, m), worst = Math.max(...Object.values(s.nulls)), r60 = s.power.R60;
  const worstShift = Math.max(...Object.keys(SHIFT_CELLS).map((c) => s.nulls[c]));
  const R1 = worst <= 0.02, R2 = r60.both >= 120, R3 = r60.both - r60.shipped >= 60, R4 = worstShift <= 0.010;
  console.log(`\nR1 every null and shift cell <= 0.020 (worst ${worst.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 R60 found >= 120 (${r60.both}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 R60 gain over shipped >= 60 (${r60.both - r60.shipped}): ${R3 ? 'pass' : 'FAIL'}`);
  console.log(`R4 every shift cell <= 0.010 (worst ${worstShift.toFixed(3)}): ${R4 ? 'pass' : 'FAIL'}`);
  console.log(`\nReference (descriptive), guard 'none' (round 4) at m ${m}, confirmation series:\n${table(con, 'none', [m])}`);
  const args = process.argv.slice(2), dir = args[0] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (R1 && R2 && R3 && R4 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file);
    const D = (x, i) => x.dates[Math.min(i, x.dates.length - 1)];
    const found = (x) => { const days = daysFromDates(x.dates), n = x.values.length - 1; return guardedCandidates(x.values, days, GUARDS[g]).filter((q) => q.gain > pen(n, m)).map((q) => ({ ...q, from: q.a + 1, to: q.b, steps: q.b - q.a })); };
    console.log(`\nREAL (seen) check, JHU's 'more often' secondary events, guard '${g}', m ${m}`);
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
  } else if (R1 && R2 && R3 && R4) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
