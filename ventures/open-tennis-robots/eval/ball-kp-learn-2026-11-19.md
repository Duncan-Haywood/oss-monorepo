# The ball hold on a wheel faster than told (2026-11-19)

Script: `tests/ball_recovery_sweep.py --kp-learn off,0.6` (and `--heldout`). Simulated only.

## The question

"A ball charged the integrator" (firmware/esp32/README.md, 2026-11-17) shipped the ball hold and named its one
regression: on 0.2 s wheels the ball's undershoots over 2% went from 7 to 17 of 72, every one a wheel whose free speed
is 11,000 rpm against the 9,000 told. There the plant's gain is 1.22 times what the loop assumes, so the proportional
term overshoots on its own, and the integrator's charge used to cushion the approach. The README's fix was "measure
`WHEEL_RPM_FULL`". Can the board do that itself, in the one window where it matters?

## The candidate (`LOOP_BALL_KP_LEARN`, off by default until the rule below says otherwise)

Before the ball, the integrator has learned the wheel's offset from the feedforward: on a wheel 1.22 times faster than
told it sits at about -18% of the feedforward. That is a measurement of the plant's gain: true / told =
feedforward / (feedforward + integrator). While the ball hold is armed (`WheelLoop.recover`), and only when the
integrator is negative (a faster wheel), kp is multiplied by (feedforward + integrator) / feedforward, floored at 0.6.
A slower-than-told wheel keeps its kp (raising it risks ringing on the slow-tach phase margin), spin-ups and braking
are untouched, and nothing outside the hold changes. The 0.6 floor is fixed a priori: `LOOP_I_FF_MAX` 0.35 already
keeps the ratio at 0.65 or more, so the floor only guards a future change of that bound. No value was tuned.

## Pre-registered (committed before either grid was run with the candidate)

**Predictions.** On the shipped 216-case grid, 0.2 s wheels' undershoots over 2% fall from 17 to about 9 of 72; the
0.4 and 0.8 s wheels change by at most 2 each; mean gate-again time changes by under 0.03 s.

**Rule: `LOOP_BALL_KP_LEARN` = 0.6 ships if every clause holds; otherwise it stays None.**

On the shipped grid (216 cases: 4 plants, wheel lags 0.2 / 0.4 / 0.8 s, free 7,000 / 11,000, 9 pairs), candidate
against shipped (band 0.005, the candidate off), the same process:

1. 0.2 s wheels, undershoots over 2%: at most 12 of 72 (shipped 17 on 2026-11-17's run; the rerun's own number
   counts if it differs, and the clause is then at least 5 fewer).
2. All 216, undershoots over 2%: no more than shipped.
3. Mean time until the gate passes again: no more than 0.03 s longer.
4. Over 3% off at the gate: no more than shipped plus 1.
5. Worst overshoot: no more than shipped plus 0.5 points.
6. Never back in 10 s: none.

On a held-out grid no earlier run used (`--heldout`, 432 cases: 4 plants, wheel lags 0.15 / 0.25 / 0.3 s, free 8,000
/ 10,000 / 10,500 / 12,000 rpm, 9 pairs):

7. Undershoots over 2% on wheels faster than told (10,000 to 12,000 rpm, 324 cases): at least 25% fewer than shipped
   (and at least 3 fewer in absolute terms).
8. Clauses 2 to 6 again, on all 432.
9. 8,000 rpm wheels (slower than told, 108 cases): identical to shipped (the candidate cannot touch them; a difference
   is a bug).

## Results

Raw: `ball-kp-learn-shipped-grid-2026-11-19.txt` / `.jsonl.gz`, `ball-kp-learn-heldout-2026-11-19.txt` / `.jsonl.gz`.
Both configurations ran in the same process pool on each grid; exact means from the rows.

### Shipped grid (216 cases)

| clause | shipped (candidate off) | candidate (0.6) | holds |
| --- | --- | --- | --- |
| 1. 0.2 s wheels, undershoots over 2% | 17 of 72 | 8 of 72 (predicted about 9) | yes (at most 12) |
| 2. all, undershoots over 2% | 19 | 8 | yes |
| 3. mean time until the gate passes again | 0.893 s | 0.890 s | yes |
| 4. over 3% off at the gate | 1 | 0 | yes |
| 5. worst overshoot | 6.0% | 4.9% | yes |
| 6. never back in 10 s | 0 | 0 | yes |

The rerun reproduced 2026-11-17's shipped numbers (17 of 72; 19 of 216; worst undershoot 4.5%). The 0.4 s wheels went
from 2 undershoots to 0, the 0.8 s wheels stayed at 0, and the 7,000 rpm (slower than told) rows are identical. Worst
undershoot 4.5% to 3.6%; slowest recovery 2.43 to 2.17 s.

### Held-out grid (432 cases)

| clause | shipped | candidate | holds |
| --- | --- | --- | --- |
| 7. faster-than-told wheels (324), undershoots over 2% | 122 | 73 (40% fewer) | yes (at least 25% and 3 fewer) |
| 2. all, undershoots over 2% | 126 | 77 | yes |
| 3. mean time until the gate passes again | 0.817 s | 0.769 s | yes |
| 4. over 3% off at the gate | 4 | 1 | yes |
| 5. worst overshoot | 6.3% | 4.9% | yes |
| 6. never back | 0 | 0 | yes |
| 9. 8,000 rpm rows identical | | identical | yes |

By free speed, undershoots over 2% of 108: 10,000 rpm 28 to 19, 10,500 rpm 36 to 24, 12,000 rpm 58 to 30. The gain
grows with the mismatch, as the mechanism says it should. Slowest recovery 2.78 to 1.97 s.

Every clause held. **It did not ship**: while these sweeps ran, PR #17530 landed the same idea on `main` as
`LOOP_BALL_GAIN = "down"` (the ratio latched at the stroke's start, both gains scaled, clamped 0.5-1.0; README "The
ball hold on a wheel faster than told"). Two mechanisms for one job is worse than one, so this branch took main's,
dropped `LOOP_BALL_KP_LEARN`, and used its untouched 432-case grid to test the shipped change instead (below). The
candidate's rows stay here (`kp_learn` 0.6 in the `.jsonl.gz` files) for comparison.

### What is left

- 0.15 s wheels still undershoot over 2% on 53 of 144 held-out cases (76 before), most behind the 80 ms ESC (45 of
  108 there overall). On those the residual dip is the ESC's lag against a fast wheel, not the gain mismatch: the
  8,000 rpm rows, where the candidate does nothing, carry 4 of their own.
- The whole drills (`tests/ball_hold_drill.py`) run at a free speed equal to the one told, where the integrator sits
  near zero and the candidate is close to a no-op, so they were not rerun. A drill on a mismatched build is the
  check still to do.
- All simulated: the simulator's first-order wheel and ESC. A real ESC's throttle curve is not linear, so the
  integrator's offset at one speed is a local, not global, gain estimate; the candidate uses it only in the second or
  two of a ball's recovery at the speed it was learned at.

## A replication of the shipped `LOOP_BALL_GAIN = "down"` on the 432-case grid

PR #17530 judged "down" on a 216-case development grid (the same one as clause 1 above) and one fresh 96-case set
fixed after its first rule failed; its first held-out set (96) came out 13 to 13, reported, not judged. The 432-case
grid above was never run against "down". It partly overlaps #17530's cells (it used 0.15 s wheels and 10,500 rpm
among others) but not its pairs-by-plant layout, and it is four times larger.

**Rule, committed before the run (the same five clauses #17530 used, on all 432):** "down" holds up if, against
`LOOP_BALL_GAIN` False, (a) undershoots over 2% fall, (b) mean time until the gate passes again is no more than
0.05 s longer, (c) no more balls over 3% off at the gate, (d) worst overshoot no more than 0.5 points higher, (e) no
case lost. Also, (f) the 8,000 rpm rows identical (the cap at 1 cannot touch them), and (g) the False rows identical
to this file's "shipped (candidate off)" held-out rows (a determinism check: both are the loop before either change).
If (a)-(e) fail, the README says so and `LOOP_BALL_GAIN` goes back to a fresh test; this run does not change it.

**Prediction.** Faster-than-told undershoots over 2% fall from 122 to between 65 and 85 (the kp-only candidate's 73,
give or take the integral gain's share).

### Replication result (`ball-gain-replication-2026-11-19.txt` / `.jsonl.gz`)

| clause | `LOOP_BALL_GAIN` False | "down" (shipped) | holds | kp-only candidate, for comparison |
| --- | --- | --- | --- | --- |
| (a) undershoots over 2%, all 432 | 126 | 76 | yes | 77 |
| faster-than-told (324), predicted 65-85 | 122 | 72 | yes (prediction held) | 73 |
| (b) mean time until the gate passes again | 0.817 s | 0.760 s | yes | 0.769 s |
| (c) over 3% off at the gate | 4 | 2 | yes | 1 |
| (d) worst overshoot | 6.3% | 4.9% | yes | 4.9% |
| (e) cases lost | 0 | 0 | yes | 0 |
| (f) 8,000 rpm rows identical | | identical | yes | identical |
| (g) False rows = this file's earlier "off" rows | | identical, all 432 | yes | |

By free speed, undershoots over 2% of 108 (False / down / kp-only): 10,000 rpm 28 / 19 / 19, 10,500 rpm 36 / 23 / 24,
12,000 rpm 58 / 30 / 30. By wheel lag of 144: 0.15 s 76 / 53 / 53, 0.25 s 31 / 15 / 15, 0.3 s 19 / 8 / 9. Worst
undershoot 5.7% / 4.3% / 4.2%; slowest recovery 2.78 / 1.97 / 1.97 s.

**The shipped change holds up on four times #17530's held-out size**, and the two designs, built independently the same
morning (one scaling kp continuously in the hold, one latching the ratio at the stroke and scaling both gains), land
within a case or two of each other on every row. The integral gain's share of the effect is small. Scaling ki as well
gains a hundredth of a second on the mean and costs one gate read over 3%. `LOOP_BALL_GAIN` stays "down", unchanged.
What is left is the same in both: 0.15 s wheels, mostly behind the 80 ms ESC, still undershoot on 53 of 144. That is
lag, not gain.
