# Ball hold with the learned plant gain: the rule, written before any run (2026-11-19)

Item (portfolio/flagships.yaml, buildable): "ball hold: WHEEL_RPM_FULL error's cost on 0.2 s wheels".
"A ball charged the integrator" (firmware/esp32/README.md) found the ball hold took 0.2 s wheels' ball undershoots
over 2% from 7 to 17 of 72, every one a wheel whose free speed is 11,000 rpm against the 9,000 told: the
proportional term drives a plant 1.22 times stiffer than the loop assumes.

Candidate: `controller.LOOP_BALL_GAIN`. When a stroke starts (`WheelLoop.ball()`), the loop latches
(ff + i) / ff, the told free speed over the true one as the integrator has learned it, clamped to 0.5-1.5, and scales
both gains by it until the ball hold ends.

Runs: `tests/ball_gain_sweep.py`, the shipped loop (ball hold on) with LOOP_BALL_GAIN off and on.

1. The development set: `tests/ball_recovery_sweep.py`'s 216 cases (9 pairs, 4 plants, wheel lags 0.2/0.4/0.8 s,
   free speeds 7,000 and 11,000 told 9,000).
2. A held-out set, fixed here: pairs (5500, 700), (4200, 1200), (3000, 2000), (2800, 3600); the same four plants;
   wheel lags 0.3 and 0.6 s and 0.15 s; free speeds 7,500 and 10,500 rpm told 9,000. 96 cases.

LOOP_BALL_GAIN ships on only if, on **both** sets:

- ball undershoots over 2% fall (all wheels), and
- the mean time until the gate passes again is no more than 0.05 s longer, and
- no more balls would leave over 3% off at the gate, and
- the worst overshoot is no more than 0.5 points higher, and
- no case that passed the gate before fails to pass it.

Otherwise it stays built and off.

## Outcome of the first rule (eval/ball-gain-sweep-2026-11-19.txt)

Development set passes every clause (undershoots over 2% 19 to 10). Held-out set fails the first clause: 13 to 15.
The wheels faster than told improve (0.15 s at 10,500: worst 4.6% to 3.8%, same count), but the wheels slower than
told, where the latch scales the gains *up*, get worse (0.15 s at 7,500: 1 to 3). Kept off.

## Second rule, written after the first outcome and before any run of the variant

Variant `LOOP_BALL_GAIN = "down"`: the latched scale is capped at 1.0 (only a wheel faster than told gets softer
gains). Because the held-out set above has now informed this variant, it is judged on a **fresh** set, fixed here:
pairs (6200, 900), (3800, 1700), (2400, 2900), (4500, 600); the same four plants; wheel lags 0.25, 0.5 and 0.18 s;
free speeds 7,200 and 10,800 rpm told 9,000. 96 cases. The same five clauses, against LOOP_BALL_GAIN off, on the
development set and the fresh set (the first held-out set is reported, not judged). Ships "down" only if both pass.
