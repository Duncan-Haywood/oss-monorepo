# Short takes: the fit sees them, the grid's end does not (2026-11-19)

Script: `tests/take_short_blind.py` (prediction and rule committed in a541b2a93 before the J to L dense curves
printed; set M's prediction and rule in 9ead6721c before set M was captured). Simulated only.

## The question

On sets J to L (`take-grid-eight-2026-11-19.md`) every build off by more than 1 ms had a half-sine take of 2.35 ms or
less, and the same builds missed on every grid tried, so the README called the misses "the fit's". Are they? The
dense refits (every 0.25 ms, 0 to 8 ms, the board's fit and depth) of every surveyed wheel answer it without a new
capture: if the summed residual curve bottoms out near 0 for a 1.5 ms take, the fit is blind; if it bottoms out near
1.5 ms, the miss is in the grid or the pick.

## J to L (216 drills, `take-dense-jkl-2026-11-19.jsonl.gz`, `take-short-blind-2026-11-19.txt`)

| | result |
| --- | --- |
| summed dense least within 0.5 ms of true, 1.5 ms takes | 13 of 18 (predicted at least 12: held) |
| the same, 2.35 ms takes | 15 of 18 |
| the same, every take | 197 of 216 |
| shipped grid's least sum at 0 ms, 1.5 ms takes | 8 of 18 (predicted all: half held) |

The fit is not blind under 2.5 ms on most builds. The summed curve is a flat shelf from 0 to about a millisecond
below the take, then a valley at the take. With grid points at 0, 2 and 3 ms, a 1.5 ms take's valley sits between
the shelf point and 2 ms, and a 2.35 ms take's parabola through 0, 2 and 3 ms leans into the shelf (1-1.5 ms).

The pre-registered fix, `end_pick` (a parabola through the first three sums when 0 ms is least), failed its rule:
179 within 0.5 ms against 185, and 10 instant builds moved off 0 against 3, because on an instant take the shelf is
flat and a vertex between 0 and 2 ms lands anywhere. Not a candidate.

The shipped parabola on the cached dense rows reproduces yesterday's 185 of 216 within 0.5 ms; large misses read 16
here against 15 there (the cache keeps 4 significant figures, which moved one near-tie).

## Other grids on J to L (exploratory, chosen on these sets; `take-short-grids-explore-2026-11-19.txt`)

| grid (ms), shipped parabola | within 0.5 ms | off by more than 1 ms | mean abs | short takes within 0.5 ms |
| --- | --- | --- | --- | --- |
| 0, 2, 3, 4, 5, 6, 7, 8 (shipped) | 185 | 16 | 0.375 | 31 of 54 |
| every millisecond 0-8 | 188 | 13 | 0.349 | 34 of 54 |
| 0, 1.5, 2.5, 3-8 | 196 | 9 | 0.335 | 41 of 54 |
| 0, 0.5-3 by 0.5, 4-8 | 195 | 9 | 0.305 | 41 of 54 |

0, 1.5, 2.5, 3-8 ms costs one candidate more than the shipped grid (nine, the same as every millisecond) and puts
points on the shelf's edge for the takes that miss. It went to a fresh set.

## Set M (held out: wheel lag 0.55 s, seed 97, 66 drills, none aborted; `take-short-m-2026-11-19.*`)

Takes stratified under 3 ms, where the candidate can change a verdict (0, 0.3, 0.8, 1.2, 1.7, 2.1, 2.6, 2.9 ms), and
3.6, 5.4, 6.8 ms as checks.

| | shipped grid | candidate 0, 1.5, 2.5, 3-8 |
| --- | --- | --- |
| within 0.5 ms | 41 of 66 | 48 of 66 |
| off by more than 1 ms | 11 | 3 |
| mean absolute error | 0.523 ms | 0.373 ms |
| instant builds read more than 0.5 ms off 0 | 0 | 1 |
| checks (3.6-6.8 ms) within 0.5 ms | 18 | 18 |
| builds advised (share at most 0.6) / instant builds advised | 26 / 0 | 27 / 0 |

Three clauses held and one failed: one instant build (jittery tach, launcher 1) read 0.80 ms, rounded to 1.0, where
the shipped grid read 0. Its share was 0.99, so the Pi would not have advised a re-flash, but the rule was written on
reads, not advice, and it failed. **The shipped grid stays.** Where the candidate helped: 1.2 ms takes (0 of 6 within
0.5 ms to 5 of 6), 2.1 ms (2 to 6), 2.9 ms (5 to 6 with the 0 ms read gone), 0.8 ms (a 2.5 read became 1).

## Next

A fresh set (new lag and seed) for the same candidate, with the instant-build clause written on what the Pi does with
it (no instant build advised) rather than on the rounded read, decided before that set is captured. Choosing that
clause after seeing M is a change of rule, so M cannot count toward it.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --dense out.jsonl.gz eval/take-grid-eight-{j,k,l}-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --report eval/take-dense-jkl-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture m.jsonl --lag 0.55 --seed 97 --takes "0.3,0.8,1.2,1.7,2.1,2.6,2.9,3.6,5.4,6.8,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --compare eval/take-dense-m-2026-11-19.jsonl.gz "0,2,3,4,5,6,7,8" "0,1.5,2.5,3,4,5,6,7,8"
