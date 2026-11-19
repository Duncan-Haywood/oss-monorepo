// Pre-registered: SHORT SPARSE SPELLS, the guarded return pass with its direction reversed.
//
// Background (README "Lasting moves to more days: does the shipped cut have the power?", 2026-11-19,
// eval/update-rate-lasting-more.mjs): the shipped cut has the power for lasting moves to more publishing days in 8
// of 9 simulated cells, yet dates none of JHU's four documented moves that are in the data. Read post hoc, in every
// one the SHORT leg is in the data: Alaska's Monday/Wednesday/Friday spell is about June-July 2021 (monthly repeat
// shares 50%, 58%; 27-35% either side) and South Dakota's Wednesdays-only spell about July 2021 (77%; 30-48% either
// side), one to two months of FEWER publishing days before the documented return, after which the schedule is the
// one from before the spell. That section's "Next": "the mirror of the return pass, a short spell of fewer
// publishing days inside a stretch (the guarded pass with the guard reversed: share inside at least twice the share
// around), pre-registered on simulated 30- to 60-day sparse spells with the round 5 nulls; then Alaska's and South
// Dakota's spells, which are seen."
//
// Written, with the `sparse` option of bestReturnCost/returnCandidates in update-rate.mjs, before this file ran on
// any cell or on the real series. Disclosure: the monthly shares quoted above were read when the guards were
// written. On them Alaska's spell (about 54% inside, about 31% around) FAILS the 'twice' guard; that is why the
// choice between guards below is made on simulation only, and K1 (the real check) can only refuse.
//
// The pass: round 5's per-stretch model (the weekly-pattern test, LR > 32.909, picks the weekday cost 'dow', else
// the two-state chain), searching each shipped stretch for the interval of MORE repeats inside (sparse: true), the
// guard applied inside the search. Two guards, mirrors of round 5's:
//   'twice': repeat share inside >= 2 x share around (round 5's 'half' with inside and around swapped);
//   'z01':   one-sided pooled two-proportion z of (share inside - share around) >= 2.326.
// Interval >= 20 steps, >= 20 either side; reported when gain > m x 2 log(n + 1). No unguarded reference arm (round
// 5 showed the unguarded pass reports a same-count shift in 98-100% of series; it would double the run time).
// The shipped check runs with `catchUp: { method: null }`, as in eval/update-rate-lasting-more.mjs's amendment
// (the stale-feed verdict labels a change and never moves a cut or its direction; it cost 20 s a series).
//
// Cells, n 1100 values unless named, day label t % 7 with 0 = Monday, a publishing day repeats with p 0.03, any
// other day with p 0.95 (rounds 1-5's schedule model). 200 series a cell.
//   NULL: rounds 1-5's 15 NULL_CELLS (six chains at n 300 and 600, W5, W3, W5c), round 5's four SHIFT_CELLS, and
//         round 1's four POWER_CELLS read as nulls for this direction (R30, R60, R90: Monday-Friday with 30-90 days
//         of daily; I60: independent repeats 25% with 60 days at 2%), since a short return is not a sparse spell.
//         Any spell reported on a null cell is false.
//   POWER (a spell from step 500 for D steps, then the old schedule again):
//         P1w30, P1w60: Monday-Friday with Wednesdays only for 30 / 60 steps (South Dakota's shape; 29% -> 82%);
//         P3w30, P3w60: Monday-Friday with Monday/Wednesday/Friday for 30 / 60 steps (Alaska's; 29% -> 56%);
//         P5d60:        daily with Monday-Friday for 60 steps (3% -> 29%).
// FOUND = a shipped 'less often' change whose index is within 10 steps of 500, or a reported spell whose first
// step a is within 10 steps of 500 (rounds 1-5's rule, the direction reversed).
// Seeding as rounds 3-5 (cell i draws from makeRng(seed + 7919 i), cells in the order: nulls, powers); fresh seeds:
// calibration 20261229, confirmation 20261230.
// Choice (calibration): per guard, the smallest m in {3, 3.5, 4, 5, 6} whose mean false spells are <= 0.010 a series
// in every null cell; among guards that have one, the larger sum of found over the three 60-step cells at its m (a
// tie goes to 'twice', the README's). None: nothing ships.
// Confirmation (chosen guard and m only), all must hold to offer the pass:
//   S1 every null cell: mean false spells <= 0.020 a series;
//   S2 each 60-step power cell (P1w60, P3w60, P5d60): found (shipped or pass) >= 120 of 200;
//   S3 summed over those three cells, found (shipped or pass) - found (shipped alone) >= 60;
//   S4 every shift cell: mean false spells <= 0.010 a series.
// Real check (seen data, only after S1-S4 pass): K1, Alaska (documented return 2021-08-02) and South Dakota
// (2021-08-16) each have a reported spell whose END (the last step, b) falls in the event's +-10 day window
// (eventWindow); both must hold. Seen, so a pass keeps the option eligible as an opt-in only, never the default.
// K2 (descriptive, decides nothing): every reported spell on the 27 primary states and the 8 'more often' states.
// Whatever the verdict, nothing the CLI or the page prints changes in this round.
// usage: node eval/update-rate-sparse-spells.mjs [covid-data] > eval/update-rate-sparse-spells.out.txt
import { updateRateChanges, returnCandidates, daysFromDates, repeatIndicators, weeklyPatternLR, WEEKLY_TEST } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { NULL_CELLS, POWER_CELLS as RETURN_CELLS, valuesFrom } from './update-rate-returns.mjs';
import { SHIFT_CELLS } from './update-rate-returns-guard.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';

export const MULTS = [3, 3.5, 4, 5, 6];
export const GUARDS = { twice: { kind: 'ratio', r: 0.5 }, z01: { kind: 'z', z: 2.326 } };
const SEED_CAL = 20261229, SEED_CON = 20261230, START = 500, TOL = 10, N = 1099, REPS = Number(process.env.REPS_SMOKE) || 200;
const SHIPPED_OPTS = { catchUp: { method: null } };

function schedule(rnd, n, pub, pOn = 0.03, pOff = 0.95) { const z = []; for (let t = 0; t < n; t++) z.push(rnd() < (pub(t) ? pOn : pOff) ? 1 : 0); return z; }
const on = (...d) => (t) => d.includes(t % 7);
const W1 = on(2), W3 = on(0, 2, 4), W5 = on(0, 1, 2, 3, 4), W7 = () => true;
const spell = (base, inside, D) => (rnd) => schedule(rnd, N, (t) => (t >= START && t < START + D ? inside(t) : base(t)));
export const SPELL_CELLS = {
  P1w30: spell(W5, W1, 30), P1w60: spell(W5, W1, 60),
  P3w30: spell(W5, W3, 30), P3w60: spell(W5, W3, 60),
  P5d60: spell(W7, W5, 60),
};
const SIXTY = ['P1w60', 'P3w60', 'P5d60'];
export const NULLS_ALL = { ...NULL_CELLS, ...SHIFT_CELLS, ...Object.fromEntries(Object.entries(RETURN_CELLS).map(([k, g]) => [`${k} as null`, g])) };
const CELLS = [...Object.keys(NULLS_ALL), ...Object.keys(SPELL_CELLS)];
const pen = (n, m) => m * 2 * Math.log(n + 1);

/** Round 5's per-stretch choice ('dow' where the stretch reads as weekly, else 'chain'), searching for sparse spells. */
export function spellCandidates(values, days, guard, { u = null } = {}) {
  u = u || updateRateChanges(values, SHIPPED_OPTS);
  const z = repeatIndicators(values);
  const D = new Map(returnCandidates(values, { kind: 'dow', days, u, guard, sparse: true }).map((q) => [q.L, q]));
  const F = new Map(returnCandidates(values, { kind: 'chain', days, u, guard, sparse: true }).map((q) => [q.L, q]));
  const out = [];
  for (const L of new Set([...D.keys(), ...F.keys()])) {
    const q = D.get(L) || F.get(L), lr = weeklyPatternLR(z, days, q.L, q.R), weekly = lr > WEEKLY_TEST.crit;
    const c = weekly ? D.get(L) : F.get(L);
    if (c) out.push({ ...c, lr, weekly, kind: weekly ? 'dow' : 'chain' });
  }
  return out;
}

export function runCell(seed, ci, reps = REPS) {
  const name = CELLS[ci], gen = NULLS_ALL[name] || SPELL_CELLS[name], rnd = makeRng(seed + 7919 * ci), rows = [];
  for (let r = 0; r < reps; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v, SHIPPED_OPTS), days = z.map((_, s) => s % 7);
    const shipped = u.changes.some((c) => c.direction === 'less often' && Math.abs(c.index - 1 - START) <= TOL);
    const cand = Object.fromEntries(Object.entries(GUARDS).map(([g, gd]) => [g, spellCandidates(v, days, gd, { u }).map((q) => ({ a: q.a, gain: q.gain }))]));
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
  const L = [`  cell            ${mults.map((m) => `m ${m}`.padStart(8)).join('')}`];
  for (const c of Object.keys(S[0].nulls)) L.push(`  ${c.padEnd(15)} ${S.map((s) => s.nulls[c].toFixed(3).padStart(8)).join('')}`);
  for (const c of Object.keys(S[0].power)) L.push(`  ${(c + ' found').padEnd(15)} ${S.map((s) => String(s.power[c].both).padStart(8)).join('')}   (shipped alone ${S[0].power[c].shipped})`);
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
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { spellWorker: true } });
      live++;
      w.on('message', (msg) => { res[msg.ci] = msg.out; next(w); });
      w.on('error', fail);
      next(w);
    }
  });
}

if (!isMainThread && workerData?.spellWorker) {
  parentPort.on('message', ({ seed, ci }) => parentPort.postMessage({ ci, out: runCell(seed, ci) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const cal = await runAll(SEED_CAL);
  const pick = {};
  for (const g of Object.keys(GUARDS)) {
    console.log(`CALIBRATION, seed ${SEED_CAL}, guard '${g}': mean false spells a series (null cells), found of ${REPS} (power cells)`);
    console.log(table(cal, g, MULTS));
    const i = MULTS.findIndex((m) => Object.values(summarise(cal, g, m).nulls).every((f) => f <= 0.010));
    const p = i < 0 ? null : summarise(cal, g, MULTS[i]).power;
    pick[g] = i < 0 ? null : { m: MULTS[i], score: SIXTY.reduce((s, c) => s + p[c].both, 0) };
    console.log(pick[g] ? `\n'${g}': smallest m meeting <= 0.010 in every null cell: m ${pick[g].m} (60-step cells found ${pick[g].score})\n` : `\n'${g}': no m meets <= 0.010 in every null cell\n`);
  }
  const ok = Object.keys(GUARDS).filter((g) => pick[g]);
  if (!ok.length) { console.log(`No guard has an m meeting the null budget: nothing ships.\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`); process.exit(0); }
  const g = ok.reduce((b, a) => (pick[a].score > pick[b].score ? a : b), ok[0]), m = pick[g].m;
  console.log(`Chosen: guard '${g}', m ${m}`);
  console.log(`\nCONFIRMATION, seed ${SEED_CON}, chosen guard and m only`);
  const con = await runAll(SEED_CON);
  console.log(table(con, g, [m]));
  const s = summarise(con, g, m), worst = Math.max(...Object.values(s.nulls));
  const worstShift = Math.max(...Object.keys(SHIFT_CELLS).map((c) => s.nulls[c]));
  const low = SIXTY.filter((c) => s.power[c].both < 120), gain = SIXTY.reduce((t, c) => t + s.power[c].both - s.power[c].shipped, 0);
  const S1 = worst <= 0.02, S2 = low.length === 0, S3 = gain >= 60, S4 = worstShift <= 0.010;
  console.log(`\nS1 every null cell <= 0.020 (worst ${worst.toFixed(3)}): ${S1 ? 'pass' : 'FAIL'}`);
  console.log(`S2 each 60-step cell found >= 120 (${SIXTY.map((c) => `${c} ${s.power[c].both}`).join(', ')}): ${S2 ? 'pass' : 'FAIL'}`);
  console.log(`S3 60-step cells' gain over shipped >= 60 (${gain}): ${S3 ? 'pass' : 'FAIL'}`);
  console.log(`S4 every shift cell <= 0.010 (worst ${worstShift.toFixed(3)}): ${S4 ? 'pass' : 'FAIL'}`);
  const dir = process.argv[2] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (S1 && S2 && S3 && S4 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file);
    const Dt = (x, i) => x.dates[Math.min(i, x.dates.length - 1)];
    const found = (x) => { const days = daysFromDates(x.dates), n = x.values.length - 1; return spellCandidates(x.values, days, GUARDS[g], { u: updateRateChanges(x.values) }).filter((q) => q.gain > pen(n, m)).map((q) => ({ ...q, from: q.a + 1, to: q.b, steps: q.b - q.a })); };
    console.log(`\nREAL (seen) check K1, guard '${g}', m ${m}: a spell ending in the documented return's +-10 day window`);
    let dated = 0; const evs = SECONDARY.filter((e) => e.direction === 'more often' && ['Alaska', 'South Dakota'].includes(e.state));
    for (const e of evs) {
      const x = by.get(e.state), q = found(x), [w0, w1] = eventWindow(x.dates, e);
      const hit = q.find((r) => r.to >= w0 && r.to <= w1);
      if (hit) dated++;
      console.log(`${e.state.padEnd(14)} ${e.date} ${e.what.padEnd(34)} ${hit ? `DATED spell ${Dt(x, hit.from)}..${Dt(x, hit.to)} (${hit.steps} days, ${hit.kind}, LR ${hit.lr.toFixed(1)}), repeats ${(100 * hit.shareInside).toFixed(0)}% inside, ${(100 * hit.shareOutside).toFixed(0)}% around` : `missed${q.length ? ` (spells ${q.map((r) => `${Dt(x, r.from)}..${Dt(x, r.to)}`).join(', ')})` : ''}`}`);
    }
    console.log(`\nK1 dated ${dated} of ${evs.length} (bar: both): ${dated === evs.length ? 'pass' : 'FAIL'}`);
    console.log('\nK2 (descriptive) every spell on the 27 primary states and the 8 \'more often\' states');
    const states = [...new Set([...PRIMARY.map((e) => e.state), ...SECONDARY.filter((e) => e.direction === 'more often').map((e) => e.state)])];
    for (const st of states) {
      const x = by.get(st);
      for (const r of found(x)) console.log(`  ${st.padEnd(21)} ${Dt(x, r.from)}..${Dt(x, r.to)} (${r.steps} days, ${r.kind}, LR ${r.lr.toFixed(1)}) ${(100 * r.shareInside).toFixed(0)}% inside, ${(100 * r.shareOutside).toFixed(0)}% around, gain ${r.gain.toFixed(1)} vs ${pen(x.values.length - 1, m).toFixed(1)}`);
    }
  } else if (S1 && S2 && S3 && S4) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
