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

(filled in after the runs)
