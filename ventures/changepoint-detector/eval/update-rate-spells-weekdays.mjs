// Pre-registered: SHORT SPELLS SCORED ON THE WEEKDAYS THAT DIFFER.
//
// Background (README "Short spells under different series openings", 2026-11-19): what limits the --spells line is
// how many days inside a spell the two schedules differ on. A month of Mon/Wed/Fri inside Monday-Friday differs on
// 8 or 9 Tuesdays and Thursdays and is dated in 120-174 of 200 series depending on its first weekday; a 60-day
// Monday-Friday spell inside daily (17-18 weekend days) in 138-177. That section's "Next": "a spell search that
// counts informative days directly (a score on the differing weekdays only), pre-registered against these cells".
//
// Disclosure, read before this header was written (scratch script, seed 777, 40 series a cell, the SHIPPED search
// only, not the score below): of 11 missed 30-day Mon/Wed/Fri spells after a 250-step opening, all 11 had the
// shipped weekday search's best interval at the spell with gain 25-46 against the penalty 49.0; of 12 missed 60-day
// Monday-Friday-inside-daily spells after an 800-step opening, all 12 had a weekday candidate at the spell but the
// stretch failed the weekly-pattern test (daily outside the spell), so the chain cost was used. Arm B below exists
// because of the second reading. No candidate score was run on any cell before this header was committed.
//
// The score (bestSpellWeekdays in update-rate.mjs, written with this header): inside a stretch, for an interval
// [a, b) with more repeats inside than around (and the shipped z01 guard, unchanged), LR_k is weekday k's
// likelihood ratio (one repeat probability inside, one around, against one for the stretch); a weekday counts only
// if its repeat share rises inside and LR_k > beta; score = sum of (LR_k - beta) over counted weekdays. Reported
// when score > m x 2 log(n + 1). The interval maximising the score is chosen per beta.
// Arms (spellsFromWeekdayRows):
//   A: round 5's per-stretch choice kept: the score above on stretches the weekly test reads as weekly
//      (LR > 32.909), the shipped chain search elsewhere, both against the same penalty;
//   B: as A, and on a stretch the weekly test does NOT read as weekly, the score above too when the chain finds
//      nothing over the penalty.
// Grid: beta in {0, 2, 4, 6}; m in {1.5, 2, 2.5, 3, 3.5, 4, 5}.
//
// Calibration (seed 20261232), the spells round's cells (eval/update-rate-sparse-spells.mjs: its 23 null cells,
// shift cells among them, and five spell cells P1w30, P1w60, P3w30, P3w60, P5d60 from step 500, n 1100), 200
// series a cell, FOUND as there (a shipped 'less often' change, or a spell whose first step is within 10 of 500).
// Choice: per (arm, beta), the smallest m whose mean false spells are <= 0.010 a series in every null cell; among
// those, the largest found summed over the five spell cells; ties to A, then the larger beta. None: nothing ships.
// Confirmation (chosen arm, beta, m only; the shipped search beside it on the same series):
//   C1 (seed 20261233, spells round's cells) every null cell: mean false spells <= 0.020 a series;
//   C2 (same) every shift cell: <= 0.010;
//   C3 (seed 20261234, the openings round's 54 cells, eval/update-rate-spells-openings.mjs) every null cell: false
//      spells the line prints (search spells + edge spells overlapping none of them) <= 0.020 a series;
//   C4 (same) summed over the 12 weak cells (P3w30 and P5d60 at the six openings): LINE found with the new search
//      minus LINE found with the shipped search, on the same series, >= 150 (of 2,400);
//   C5 (same) no spell cell (30) has LINE found lower than the shipped search's by more than 10.
//   C6 (same, reported; not needed to ship) the openings round's O1: each shape's LINE found within 30 of its P500
//      cell at every opening.
// Real check (seen data; only if C1-C5 pass): K1, as the spells round: Alaska (return 2021-08-02) and South Dakota
// (2021-08-16) each have a reported spell whose END falls in the event's +-10 day window, on JHU's series. K2
// (descriptive): every spell on the 35 states, against the shipped search's eight.
// What follows: C1-C5 and K1 pass -> shortSpells takes the chosen arm, beta and m (still behind --spells, still not
// a default line). Otherwise nothing the CLI or the page prints changes, and the README records which bar failed.
// usage: node eval/update-rate-spells-weekdays.mjs [covid-data] > eval/update-rate-spells-weekdays.out.txt
import { updateRateChanges, shortSpells, edgeSpellsOf, spellWeekdayCandidates, spellsFromWeekdayRows, daysFromDates, SHORT_SPELLS } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { valuesFrom } from './update-rate-returns.mjs';
import { SHIFT_CELLS } from './update-rate-returns-guard.mjs';
import { NULLS_ALL, SPELL_CELLS } from './update-rate-sparse-spells.mjs';
import { CELLS as OPEN_CELLS, makeSeries } from './update-rate-spells-openings.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';

export const BETAS = [0, 2, 4, 6];
export const MULTS = [1.5, 2, 2.5, 3, 3.5, 4, 5];
export const ARMS = ['A', 'B'];
const SEED_CAL = 20261232, SEED_CON = 20261233, SEED_OPEN = 20261234, START = 500, TOL = 10;
const REPS = Number(process.env.REPS_SMOKE) || 200;
const SHIPPED_OPTS = { catchUp: { method: null } };
const SR_CELLS = [...Object.keys(NULLS_ALL), ...Object.keys(SPELL_CELLS)];
const pen = (n, m) => m * 2 * Math.log(n + 1);
const slim = (rows) => rows.map((r) => ({ weekly: r.weekly, chain: r.chain && { a: r.chain.a, b: r.chain.b, gain: r.chain.gain }, sel: r.sel.map((q) => q && { a: q.a, b: q.b, gain: q.gain }) }));

/** Spells-round cell: per series n, the shipped change flag, the shipped search's spell starts, and the candidate rows. */
function runSR(seed, ci, betas) {
  const name = SR_CELLS[ci], gen = NULLS_ALL[name] || SPELL_CELLS[name], rnd = makeRng(seed + 7919 * ci), out = [];
  for (let r = 0; r < REPS; r++) {
    const z = gen(rnd), v = valuesFrom(z), u = updateRateChanges(v, SHIPPED_OPTS), days = z.map((_, s) => s % 7);
    const shipped = u.changes.some((c) => c.direction === 'less often' && Math.abs(c.index - 1 - START) <= TOL);
    const search = betas.length === 1 ? shortSpells(v, { days, u }).spells.map((s) => s.from - 1) : null;
    out.push({ n: z.length, shipped, search, rows: slim(spellWeekdayCandidates(v, { days, betas, u })) });
  }
  return { name, out };
}

/** Openings cell: the shipped line and the new line on the same series. */
function runOpen(ci, cfg) {
  const c = OPEN_CELLS[ci], rnd = makeRng(SEED_OPEN + 7919 * ci), out = [];
  for (let r = 0; r < REPS; r++) {
    const { z, S } = makeSeries(rnd, c.opening, c.shape, c.isNull), v = valuesFrom(z);
    const u = updateRateChanges(v, SHIPPED_OPTS), days = z.map((_, s) => s % 7);
    const edge = edgeSpellsOf(u).map((s) => ({ a: s.from - 1, b: s.to }));
    const oldS = shortSpells(v, { days, u }).spells.map((s) => ({ a: s.from - 1, b: s.to }));
    const rows = spellWeekdayCandidates(v, { days, betas: [cfg.beta], u });
    const newS = spellsFromWeekdayRows(rows, { arm: cfg.arm, t: 0, pen: pen(z.length, cfg.m) }).map((s) => ({ a: s.from - 1, b: s.to }));
    const line = (S0) => [...S0, ...edge.filter((e) => !S0.some((s) => s.a < e.b && e.a < s.b))];
    const Lo = line(oldS), Ln = line(newS), at = (q) => Math.abs(q.a - S) <= TOL;
    out.push(c.isNull ? { falseOld: Lo.length, falseNew: Ln.length } : { old: Lo.some(at), neu: Ln.some(at) });
  }
  return { ...c, out };
}

function summarise(cells, arm, t, m) {
  const nulls = {}, power = {};
  for (const { name, out } of cells) {
    const sp = out.map((x) => spellsFromWeekdayRows(x.rows, { arm, t, pen: pen(x.n, m) }));
    if (NULLS_ALL[name]) nulls[name] = sp.reduce((s, q) => s + q.length, 0) / out.length;
    else power[name] = {
      neu: out.filter((x, i) => x.shipped || sp[i].some((q) => Math.abs(q.from - 1 - START) <= TOL)).length,
      shippedAlone: out.filter((x) => x.shipped).length,
      old: out[0].search ? out.filter((x) => x.shipped || x.search.some((a) => Math.abs(a - START) <= TOL)).length : null,
    };
  }
  return { nulls, power };
}

function pool(jobs) {
  const W = Math.min(availableParallelism(), jobs.length), queue = jobs.map((_, i) => i), res = new Array(jobs.length);
  return new Promise((done, fail) => {
    let live = 0;
    const next = (w) => {
      if (!queue.length) { w.terminate(); if (--live === 0) done(res); return; }
      const i = queue.shift(); w.postMessage({ i, job: jobs[i] });
    };
    for (let k = 0; k < W; k++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { weekdaysWorker: true } });
      live++;
      w.on('message', (msg) => { res[msg.i] = msg.out; next(w); });
      w.on('error', fail);
      next(w);
    }
  });
}

if (!isMainThread && workerData?.weekdaysWorker) {
  parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, out: job.kind === 'sr' ? runSR(job.seed, job.ci, job.betas) : runOpen(job.ci, job.cfg) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now(), f3 = (x) => x.toFixed(3);
  const cal = await pool(SR_CELLS.map((_, ci) => ({ kind: 'sr', seed: SEED_CAL, ci, betas: BETAS })));
  console.log(`CALIBRATION, seed ${SEED_CAL}, ${REPS} series a cell: per arm and beta, the worst null cell's mean false spells and found summed over the five spell cells, by m`);
  const picks = [];
  for (const arm of ARMS) for (let t = 0; t < BETAS.length; t++) {
    const S = MULTS.map((m) => summarise(cal, arm, t, m));
    const worst = S.map((s) => Math.max(...Object.values(s.nulls))), found = S.map((s) => Object.values(s.power).reduce((a, p) => a + p.neu, 0));
    console.log(`  ${arm} beta ${BETAS[t]}: ${MULTS.map((m, i) => `m ${m} ${f3(worst[i])}/${found[i]}`).join('  ')}`);
    const i = worst.findIndex((w) => w <= 0.010);
    if (i >= 0) picks.push({ arm, t, beta: BETAS[t], m: MULTS[i], score: found[i], cells: S[i].power });
  }
  if (!picks.length) { console.log('\nNo arm and beta has an m meeting the null budget: nothing ships.'); process.exit(0); }
  console.log('\nEligible (smallest m with every null cell <= 0.010):');
  for (const p of picks) console.log(`  ${p.arm} beta ${p.beta} m ${p.m}: found ${p.score} (${Object.entries(p.cells).map(([c, q]) => `${c} ${q.neu}`).join(', ')})`);
  const pick = picks.reduce((b, p) => (p.score > b.score || (p.score === b.score && (p.arm < b.arm || (p.arm === b.arm && p.beta > b.beta))) ? p : b));
  const cfg = { arm: pick.arm, beta: pick.beta, m: pick.m };
  console.log(`Chosen: arm ${cfg.arm}, beta ${cfg.beta}, m ${cfg.m}`);

  const con = await pool(SR_CELLS.map((_, ci) => ({ kind: 'sr', seed: SEED_CON, ci, betas: [cfg.beta] })));
  const s = summarise(con, cfg.arm, 0, cfg.m);
  console.log(`\nCONFIRMATION 1, seed ${SEED_CON}, spells round's cells: mean false spells a series (nulls); found new / shipped search / shipped change alone`);
  for (const [c, f] of Object.entries(s.nulls)) console.log(`  ${c.padEnd(18)} ${f3(f)}`);
  for (const [c, p] of Object.entries(s.power)) console.log(`  ${c.padEnd(18)} ${p.neu} / ${p.old} / ${p.shippedAlone}`);
  const worst = Math.max(...Object.values(s.nulls)), worstShift = Math.max(...Object.keys(SHIFT_CELLS).map((c) => s.nulls[c]));
  const C1 = worst <= 0.020, C2 = worstShift <= 0.010;

  const op = await pool(OPEN_CELLS.map((_, ci) => ({ kind: 'open', ci, cfg })));
  console.log(`\nCONFIRMATION 2, seed ${SEED_OPEN}, openings round's cells: LINE found new / shipped (spell cells); false spells printed a series new / shipped (null cells)`);
  const L = {}, ops = [...new Set(OPEN_CELLS.map((c) => c.opening))];
  let worstOpen = 0, weakGain = 0; const losses = [];
  for (const r of op) {
    if (r.isNull) {
      const fn = r.out.reduce((a, x) => a + x.falseNew, 0) / r.out.length, fo = r.out.reduce((a, x) => a + x.falseOld, 0) / r.out.length;
      worstOpen = Math.max(worstOpen, fn);
      console.log(`  null ${r.shape.padEnd(5)} ${r.opening.padEnd(8)} ${f3(fn)} / ${f3(fo)}`);
    } else {
      const n = r.out.filter((x) => x.neu).length, o = r.out.filter((x) => x.old).length;
      (L[r.shape] ||= {})[r.opening] = n;
      if (['P3w30', 'P5d60'].includes(r.shape)) weakGain += n - o;
      if (o - n > 10) losses.push(`${r.shape} ${r.opening} ${n} vs ${o}`);
      console.log(`  ${r.shape.padEnd(10)} ${r.opening.padEnd(8)} ${String(n).padStart(3)} / ${String(o).padStart(3)}`);
    }
  }
  const o1 = Object.keys(L).flatMap((sh) => ops.filter((o) => Math.abs(L[sh][o] - L[sh].P500) > 30).map((o) => `${sh} ${o} ${L[sh][o]} vs ${L[sh].P500}`));
  const C3 = worstOpen <= 0.020, C4 = weakGain >= 150, C5 = losses.length === 0;
  console.log(`\nC1 every spells-round null cell <= 0.020 (worst ${f3(worst)}): ${C1 ? 'pass' : 'FAIL'}`);
  console.log(`C2 every shift cell <= 0.010 (worst ${f3(worstShift)}): ${C2 ? 'pass' : 'FAIL'}`);
  console.log(`C3 every openings null cell <= 0.020 printed (worst ${f3(worstOpen)}): ${C3 ? 'pass' : 'FAIL'}`);
  console.log(`C4 weak cells' LINE gain over shipped >= 150 (${weakGain}): ${C4 ? 'pass' : 'FAIL'}`);
  console.log(`C5 no spell cell loses more than 10: ${C5 ? 'pass' : `FAIL (${losses.join('; ')})`}`);
  console.log(`C6 (reported) O1 within 30 of P500 at every opening: ${o1.length ? `FAIL (${o1.join('; ')})` : 'pass'}`);

  const dir = process.argv[2] || 'covid-data', file = join(dir, 'time_series_covid19_confirmed_US.csv');
  if (C1 && C2 && C3 && C4 && C5 && existsSync(file)) {
    const { readStates, SECONDARY, PRIMARY, eventWindow } = await import('./update-rate-covid-schedules.mjs');
    const by = readStates(file), Dt = (x, i) => x.dates[Math.min(i, x.dates.length - 1)];
    const found = (x) => { const days = daysFromDates(x.dates), n = x.values.length - 1; return spellsFromWeekdayRows(spellWeekdayCandidates(x.values, { days, betas: [cfg.beta], u: updateRateChanges(x.values) }), { arm: cfg.arm, t: 0, pen: pen(n, cfg.m) }); };
    console.log(`\nREAL (seen) check K1: a spell ending in the documented return's +-10 day window`);
    let dated = 0; const evs = SECONDARY.filter((e) => e.direction === 'more often' && ['Alaska', 'South Dakota'].includes(e.state));
    for (const e of evs) {
      const x = by.get(e.state), q = found(x), [w0, w1] = eventWindow(x.dates, e), hit = q.find((r) => r.to >= w0 && r.to <= w1);
      if (hit) dated++;
      console.log(`${e.state.padEnd(14)} ${e.date} ${e.what.padEnd(34)} ${hit ? `DATED spell ${Dt(x, hit.from)}..${Dt(x, hit.to)} (${hit.steps} days, ${hit.kind}), repeats ${(100 * hit.shareInside).toFixed(0)}% inside, ${(100 * hit.shareOutside).toFixed(0)}% around` : `missed${q.length ? ` (spells ${q.map((r) => `${Dt(x, r.from)}..${Dt(x, r.to)}`).join(', ')})` : ''}`}`);
    }
    console.log(`\nK1 dated ${dated} of ${evs.length} (bar: both): ${dated === evs.length ? 'pass' : 'FAIL'}`);
    console.log('\nK2 (descriptive) every spell on the 27 primary states and the 8 \'more often\' states: new search, then [shipped]');
    const states = [...new Set([...PRIMARY.map((e) => e.state), ...SECONDARY.filter((e) => e.direction === 'more often').map((e) => e.state)])];
    let nNew = 0, nOld = 0;
    for (const st of states) {
      const x = by.get(st), days = daysFromDates(x.dates), q = found(x), old = shortSpells(x.values, { days }).spells;
      nNew += q.length; nOld += old.length;
      for (const r of q) console.log(`  ${st.padEnd(21)} ${Dt(x, r.from)}..${Dt(x, r.to)} (${r.steps} days, ${r.kind}) ${(100 * r.shareInside).toFixed(0)}% inside, ${(100 * r.shareOutside).toFixed(0)}% around`);
      for (const r of old) console.log(`  ${st.padEnd(21)} [shipped ${Dt(x, r.from)}..${Dt(x, r.to)} (${r.steps} days, ${r.kind})]`);
    }
    console.log(`K2 spells: new ${nNew}, shipped ${nOld}`);
  } else if (C1 && C2 && C3 && C4 && C5) console.log(`\n(${file} missing: sh eval/covid-schedules-fetch.sh ${dir})`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
