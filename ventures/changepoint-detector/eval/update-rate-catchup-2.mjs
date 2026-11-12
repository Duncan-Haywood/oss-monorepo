// Pre-registered, round two of the catch-up check (README "One-tick stale feeds: the catch-up check").
//
// Round one (eval/update-rate-catchup.mjs, seed 20261213) failed K1: with runs >= 2 and ratio >= 1.4 a
// rounded walk that is only 0.6 ticks a step (R3) was called a catch-up in 6.0% of series (bar 5%),
// because its occasional two-tick moves after a long run push a noisy ratio over 1.4. The one-tick
// stale cells passed easily (90% to 96%). Seed 20261213 is spent: nothing below is chosen on it.
//
// This file was committed before either step below ran.
// Step 1, calibration on seed 2 (same cells, same reps, the round-one cell code): grid
//   minRun in {2, 3}, ratio in {1.4, 1.6, 1.8, 2.0, 2.4}, minMoves in {5, 10}.
//   Admissible: every R cell catchUp <= 2.5% of one-tick series (half the K1 bar, for margin).
//   Pick the admissible setting with the largest smallest catchUp share over the T cells
//   (ties: larger ratio, then larger minMoves, then smaller minRun). None admissible: stop, no ship.
// Step 2, confirmation on fresh seed 20261214, run once with the picked setting: round one's rule
//   K1 to K3 unchanged (R catchUp <= 5% and rounding >= 90%; judged T cells catchUp >= 80% with >= 2
//   judged; F rounding <= 5%). Pass: the setting becomes update-rate.mjs CATCHUP. Fail: it does not
//   ship and CATCHUP stays off.
// usage: node eval/update-rate-catchup-2.mjs > eval/update-rate-catchup-2.out.txt
import { run } from './update-rate-catchup.mjs';

export const CALIBRATION_SEED = 2, CONFIRMATION_SEED = 20261214;
const GRID = [];
for (const minRun of [2, 3]) for (const ratio of [1.4, 1.6, 1.8, 2.0, 2.4]) for (const minMoves of [5, 10]) GRID.push({ minRun, ratio, minMoves });
const R = ['R1', 'R2', 'R3'], T = ['T1', 'T2', 'T3'];

export function calibrate() {
  const rows = GRID.map((g) => {
    const r = run(CALIBRATION_SEED, 200, g);
    const maxR = Math.max(...R.map((k) => r.cells[k].caughtShare));
    const minT = Math.min(...T.map((k) => r.cells[k].caughtShare));
    return { ...g, maxR, minT, ok: maxR <= 0.025 };
  });
  const ok = rows.filter((x) => x.ok).sort((a, b) => b.minT - a.minT || b.ratio - a.ratio || b.minMoves - a.minMoves || a.minRun - b.minRun);
  return { rows, pick: ok[0] || null };
}

export function confirm(pick) { return run(CONFIRMATION_SEED, 200, { minRun: pick.minRun, ratio: pick.ratio, minMoves: pick.minMoves }); }

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  const c = calibrate();
  console.log(`Step 1, calibration seed ${CALIBRATION_SEED}: max R catchUp share, min T catchUp share`);
  for (const x of c.rows) console.log(`minRun ${x.minRun} ratio ${x.ratio.toFixed(1)} minMoves ${String(x.minMoves).padStart(2)}  maxR ${x.maxR.toFixed(3)}  minT ${x.minT.toFixed(3)}${x.ok ? '  admissible' : ''}`);
  if (!c.pick) { console.log('No admissible setting: does not ship'); process.exit(0); }
  const p = c.pick;
  console.log(`Picked: minRun ${p.minRun}, ratio ${p.ratio}, minMoves ${p.minMoves}`);
  const r = confirm(p);
  console.log(`\nStep 2, confirmation seed ${CONFIRMATION_SEED}, 200 series a cell`);
  console.log('cell  with a change  one tick  catchUp  share of one tick  rounding  share of found');
  for (const [k, v] of Object.entries(r.cells)) {
    console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.oneTick).padStart(8)}  ${String(v.caught).padStart(7)}  ${(Number.isNaN(v.caughtShare) ? '-' : v.caughtShare.toFixed(3)).padStart(17)}  ${String(v.rounding).padStart(8)}  ${v.roundingShare.toFixed(3).padStart(14)}`);
  }
  console.log(`judged T cells: ${r.judged.join(', ') || 'none'}`);
  console.log(`K1: ${r.k1 ? 'pass' : 'FAIL'}; K2: ${r.k2 ? 'pass' : 'FAIL'}; K3: ${r.k3 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${r.ships ? 'the catch-up check ships' : 'does not ship'}`);
}
