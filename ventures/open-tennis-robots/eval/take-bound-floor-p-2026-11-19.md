# A ppm floor on the TAKE_US = 0 bound, held out on set P (2026-11-19)

Script: `tests/take_shelf_bound.py` (PART 3; the floor's design, prediction and rule committed in 881d6c775 before set P
was captured). Simulated only.

## The item

`eval/take-bound-o-2026-11-19.md` shipped a bound on the Pi's "keep TAKE_US = 0" line: the first grid candidate whose
mean rms is more than 2% over the step's. It held on set O by one build. Its two misses were 2.0 ms takes on the
1/8 us capture tach, at a 16 and 19 ppm step: the frame carries whole ppm, so one ppm of rounding is 5-6% there and
clears 2% on its own. The candidate fix: a candidate counts as worse than the step only when it is over
max(step x 1.02, step + FLOOR ppm).

## Design (seen data: J to L, M, N dense refits and set O)

| floor (ppm) | J-N within bound (of 145) | O within bound (of 49) | J-N instant builds at 1.5 ms (of 30) |
| --- | --- | --- | --- |
| 0 (shipped) | 145 | 47 | 20 |
| 1 | 145 | 48 | 20 |
| 2 | 145 | 49 | 17 |
| 3 | 145 | 49 | 15 |
| 4 | 145 | 49 | 15 |

FLOOR = 2 is the smallest that covers all of O; the price is a looser bound on 3 of 30 instant builds.

Rule, written before P: the floor ships only if, on P, (a) its coverage of the builds told TAKE_US = 0 is at least 95%
and at least the 2%-alone coverage, and (b) its bound is 1.5 ms on at least half the instant builds.

## Set P

Wheel lag 0.58 s, seed 113 (neither used by an earlier take capture); takes 0.1, 0.5, 0.9, 1.3, 1.6, 2.0, 2.4, 2.8,
3.5, 5.0 ms and instant; two tachs, three launchers; 66 drills, the board's own TAKE_SURVEY frames with the nine-point
grid live (`take-bound-floor-p-2026-11-19.jsonl.gz`, `take-bound-floor-p-2026-11-19.txt`).

| | 2% alone | max(2%, 2 ppm) | needed |
| --- | --- | --- | --- |
| builds told TAKE_US = 0 | 48 of 66 | 48 of 66 | |
| true take at most the bound | 46 (95.8%) | **48 (100%)** | 95%, and at least 2% alone |
| instant builds with the bound at 1.5 ms | 4 of 6 | **4 of 6** | half |

Both clauses held, so **`host.take_survey_bound` takes the floor** (`host.TAKE_BOUND_FLOOR_PPM = 2`). 2% alone would
have passed O's rule again on P by one build: its misses were a 1.6 ms and a 2.8 ms take each told "up to 1.5 ms",
both again on low-step builds. The floor moved five bounds on P, all upward by 0.5-2.5 ms (an instant build 2.5 to 3,
the 1.6 and 2.8 ms misses to 2.5 and 4, two 2.0 ms builds 2.5 to 3 and 3 to 4); none moved down. No board number or
verdict changed: only the bound in the advice line.

## Not known

All simulated, one seed per held-out set. The floor matters only below about 100 ppm of step rms, where 2% is under
2 ppm; on noisier tachs the line is unchanged. The deeper limit stays the tach's one pulse a revolution.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --floor-design eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz eval/take-bound-o-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture p.jsonl --lag 0.58 --seed 113 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --floor-heldout eval/take-bound-floor-p-2026-11-19.jsonl.gz
