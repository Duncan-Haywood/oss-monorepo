// Pre-registered, round five of telling a one-tick stale feed from a rounded slow series: clumped
// carry-forward (README "One-tick stale feeds: clumped carry-forward"; rounded-walk.mjs `staleTestMarkov`).
//
// Round four (eval/update-rate-stale-lr-4.mjs, .out.txt) shipped with T3, the clumped stale feed (P(stay |
// stayed) 0.7, P(stay | moved) 0.2), its weak cell: 61 of 75 one-tick series (81.3%, bar 80%). Its M1
// carries each step forward with one probability, so runs of repeats are geometric; a clumped feed's long
// runs look to it like a slow walk. The one change here: M1 becomes Markov carry-forward, one chance to
// start repeating after a fresh record (pEnter) and another to keep repeating (pStay), fitted from round
// four's M1 (pStay = pEnter is round four exactly), for each nu in round four's grid. Everything else
// (t steps, nu grid, trim to the cuts' ranges, the one-tick test, grid, search bounds) is round four's.
//
// The threshold. Under M0 (pEnter = 0) pStay is not identified, so the 50:50 chi-square mix and its 5.41
// do not hold; the Markov statistic is >= round four's on every series. So the threshold is set by
// simulation on the null cells only, before any stale cell is run with the new test:
//   Calibration: seed 31 (not used by rounds one to four), 200 series of each null cell R1, R2, R3, X1,
//   X2. tau = the smallest value, rounded up to 0.01, at which every one of those cells has at most 2% of
//   its one-tick series with LR >= tau (half of K1's 5% bar, for margin), and never below 5.41.
//   No stale cell is run on the calibration seed.
//
// Disclosed beforehand: one smoke run on seed 6, 10 series a cell, to time the code (output in the
// commit message of the commit that adds this file; used to choose nothing).
//
// Confirmation: seed 20261217, run once, 200 series a cell, all of round four's cells (R1-R3, T1-T3,
// F1-F3, X1-X3). Each series' round-four statistic (lrIid) comes out of the same fit, so round four's
// rule at 5.41 is scored on exactly the same series and stretches for comparison.
// Rule. All must hold for the Markov test to replace round four's default:
//   K1-K4 as round four, with catchUp meaning Markov LR >= tau;
//   K5. T3 judged (>= 50 one-tick series), and its catchUp share >= 0.85 and >= round four's share on
//       the same series + 0.05 (the change must buy something on the cell it is for).
// Pass: CATCHUP becomes { method: 'lr', test: staleTestMarkov, trim: 'range', lr: tau }. Fail any: round
// four stays the default and the README says which line failed.
// usage: node eval/update-rate-stale-lr-5.mjs calibrate > eval/update-rate-stale-lr-5-calibration.out.txt
//        node eval/update-rate-stale-lr-5.mjs confirm <tau> > eval/update-rate-stale-lr-5.out.txt
//        node eval/update-rate-stale-lr-5.mjs smoke <seed> <reps>
import { Worker, isMainThread } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { makeRng } from './update-rate-sim.mjs';
import { CELLS } from './update-rate-stale-lr-4.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CALIBRATION_SEED = 31, CONFIRMATION_SEED = 20261217, REPS = 200;
export const NULL_CELLS = ['R1', 'R2', 'R3', 'X1', 'X2'];
import { judge } from './update-rate-stale-lr-5-worker.mjs';
export { judge };

/** tau from the null cells: smallest (to 0.01) with every cell's LR >= tau share <= 2%, at least 5.41. */
export function threshold(byCell, share = 0.02, floor = 5.41) {
  let tau = floor;
  const perCell = {};
  for (const [name, rows] of Object.entries(byCell)) {
    const lrs = rows.filter((r) => r && r.oneTick).map((r) => r.lr).sort((a, b) => b - a);
    const allowed = Math.floor(share * lrs.length);
    const need = allowed < lrs.length ? Math.ceil((lrs[allowed] + 1e-9) * 100) / 100 : floor;
    perCell[name] = { oneTick: lrs.length, allowed, need, top: lrs.slice(0, allowed + 1).map((x) => +x.toFixed(2)) };
    tau = Math.max(tau, need);
  }
  return { tau, perCell };
}

export function tally(byCell, tau) {
  const out = {};
  for (const [name, rows] of Object.entries(byCell)) {
    let found = 0, oneTick = 0, caught = 0, caughtIid = 0;
    for (const r of rows) {
      if (!r) continue;
      found++;
      if (!r.oneTick) continue;
      oneTick++;
      if (r.lr >= tau) caught++;
      if (r.lrIid >= 5.41) caughtIid++;
    }
    const rounding = oneTick - caught;
    out[name] = { found, oneTick, caught, caughtIid, rounding, caughtShare: oneTick ? caught / oneTick : NaN, iidShare: oneTick ? caughtIid / oneTick : NaN, roundingShare: found ? rounding / found : NaN };
  }
  const none = { found: 0, oneTick: 0, caught: 0, caughtIid: 0, rounding: 0, caughtShare: NaN, iidShare: NaN, roundingShare: NaN };
  for (const k of ['R1', 'R2', 'R3', 'T1', 'T2', 'T3', 'F1', 'F2', 'F3', 'X1', 'X2']) out[k] ??= none; // calibration runs only the null cells
  const R = ['R1', 'R2', 'R3'], T = ['T1', 'T2', 'T3'], F = ['F1', 'F2', 'F3'], X = ['X1', 'X2'];
  const k1 = R.every((k) => out[k].caughtShare <= 0.05 && out[k].roundingShare >= 0.9);
  const judged = T.filter((k) => out[k].oneTick >= 50);
  const k2 = judged.length >= 2 && judged.every((k) => out[k].caughtShare >= 0.8);
  const k3 = F.every((k) => out[k].roundingShare <= 0.05);
  const judgedX = X.filter((k) => out[k].oneTick >= 50);
  const k4 = judgedX.every((k) => out[k].caughtShare <= 0.1);
  const t3 = out.T3;
  const k5 = t3.oneTick >= 50 && t3.caughtShare >= 0.85 && t3.caughtShare >= t3.iidShare + 0.05;
  return { cells: out, judged, judgedX, k1, k2, k3, k4, k5, ships: k1 && k2 && k3 && k4 && k5 };
}

/** Series drawn in one stream, cell by cell (as rounds one to four), judged on worker threads. */
export async function run(seed, reps, names, threads = Math.min(4, cpus().length)) {
  const rnd = makeRng(seed), all = Object.keys(CELLS), jobs = [];
  for (const name of all) for (let i = 0; i < reps; i++) { const v = CELLS[name](rnd); if (names.includes(name)) jobs.push([name, v]); }
  const parts = Array.from({ length: threads }, (_, w) => jobs.map(([, v], j) => [j, v]).filter(([j]) => j % threads === w));
  const results = new Array(jobs.length);
  await Promise.all(parts.map((part) => new Promise((ok, bad) => {
    const wk = new Worker(fileURLToPath(new URL('./update-rate-stale-lr-5-worker.mjs', import.meta.url)), { workerData: part });
    wk.on('message', (rows) => { for (const [j, c] of rows) results[j] = c; ok(); });
    wk.on('error', bad);
  })));
  const byCell = {};
  jobs.forEach(([name], j) => { (byCell[name] ??= []).push(results[j]); });
  return byCell;
}

function print(byCell, tau, label) {
  const r = tally(byCell, tau);
  console.log(`${label}; Markov carry-forward LR >= ${tau}; round four's LR >= 5.41 on the same series for comparison`);
  console.log('cell  with a change  one tick  catchUp  share of one tick  round four  share  rounding  share of found');
  for (const [k, v] of Object.entries(r.cells).filter(([k]) => k in byCell)) {
    const f = (x) => (Number.isNaN(x) ? '-' : x.toFixed(3));
    console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.oneTick).padStart(8)}  ${String(v.caught).padStart(7)}  ${f(v.caughtShare).padStart(17)}  ${String(v.caughtIid).padStart(10)}  ${f(v.iidShare).padStart(5)}  ${String(v.rounding).padStart(8)}  ${f(v.roundingShare).padStart(14)}`);
  }
  return r;
}

const invoked = isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const mode = process.argv[2] ?? 'confirm', t0 = Date.now();
  if (mode === 'calibrate') {
    const byCell = await run(CALIBRATION_SEED, REPS, NULL_CELLS);
    writeFileSync(new URL('./update-rate-stale-lr-5-calibration.json', import.meta.url), JSON.stringify(byCell));
    const th = threshold(byCell);
    print(byCell, th.tau, `calibration seed ${CALIBRATION_SEED}, ${REPS} series a null cell`);
    for (const [k, v] of Object.entries(th.perCell)) console.log(`${k}: ${v.oneTick} one tick, ${v.allowed} may clear tau, needs tau >= ${v.need} (largest LRs ${v.top.join(', ')})`);
    console.log(`tau = ${th.tau}`);
  } else if (mode === 'smoke') {
    const seed = Number(process.argv[3] ?? 6), reps = Number(process.argv[4] ?? 10);
    const byCell = await run(seed, reps, Object.keys(CELLS));
    print(byCell, 5.41, `smoke seed ${seed}, ${reps} series a cell`);
  } else {
    const tau = Number(process.argv[3]);
    if (!Number.isFinite(tau)) throw new Error('confirm needs tau from the calibration file');
    const byCell = await run(CONFIRMATION_SEED, REPS, Object.keys(CELLS));
    writeFileSync(new URL('./update-rate-stale-lr-5.json', import.meta.url), JSON.stringify(byCell));
    const r = print(byCell, tau, `confirmation seed ${CONFIRMATION_SEED}, ${REPS} series a cell`);
    console.log(`judged T cells: ${r.judged.join(', ') || 'none'}; judged X cells: ${r.judgedX.join(', ') || 'none'} (X3 reported, not judged)`);
    console.log(`K1 (R: catchUp <= 0.05 of one tick, rounding >= 0.90): ${r.k1 ? 'pass' : 'FAIL'}`);
    console.log(`K2 (judged T: catchUp >= 0.80 of one tick, >= 2 judged): ${r.k2 ? 'pass' : 'FAIL'}`);
    console.log(`K3 (F: rounding <= 0.05): ${r.k3 ? 'pass' : 'FAIL'}`);
    console.log(`K4 (judged X1/X2: catchUp <= 0.10 of one tick): ${r.k4 ? 'pass' : 'FAIL'}`);
    console.log(`K5 (T3 judged, catchUp >= 0.85 and >= round four's share + 0.05): ${r.k5 ? 'pass' : 'FAIL'}`);
    console.log(`Verdict: ${r.ships ? 'Markov carry-forward replaces round four' : 'does not ship; round four stays'}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
