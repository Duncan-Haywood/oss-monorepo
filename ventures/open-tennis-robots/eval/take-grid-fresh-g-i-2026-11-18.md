# The nine-point take grid on fresh sets, with the error measure named first (2026-11-18)

`eval/take-grid-nine-2026-11-18.md` kept the shipped take-survey grid (0, 2, 3, 4, 5, 6, 8 ms) because its rule's
first clause, builds within 0.5 ms, tied the nine-point grid (0-8 ms by 1) exactly on sets D to F (141 of 162 each).
On the same tables, outside the rule, the nine-point grid halved the builds off by more than 1 ms (10 against 20) and
had the lower mean absolute error (0.45 against 0.53 ms). Adopting on those measures after seeing them would be the
forking path the rule exists to stop. This file names them first and tests them on sets no run has used.

**Why the measure changes.** Within 0.5 ms is a coarse bar when the Pi rounds the verdict to 0.5 ms: a take of 6.5 ms
read as 6.0 or 6.5 counts the same. What costs a user is a large miss. A 1.5 ms take read as 0 tells the operator
the wheel grips the ball for no time at all, and the take survey's advice on re-flashing `TAKE_US` then points the
wrong way. So the primary measure here is **builds off by more than 1 ms**, with the mean absolute error as a guard.

**A second bias fixed.** D to F's takes all sat on the half-millisecond, exactly 0.5 ms from every nine-point point.
Real contact times fall anywhere. G to I draw one take uniformly in each millisecond, 0-1 to 7-8 ms, with the
fraction kept between 0.1 and 0.9 so no take lands on a grid point, rounded to 0.05 ms, from Python's
`random.Random(20261118)`, drawn once before any capture and not redrawn:

    0.8, 1.75, 2.35, 3.15, 4.1, 5.4, 6.5, 7.45 ms, plus the instant build (0 ms) as the advice check

Fresh sets, neither lag nor seed used by an earlier take capture (used before: lag 0.35, 0.4, 0.45, 0.5, 0.55, 0.6,
0.7, 0.8 s; seeds 29, 31, 37, 43, 47, 53, 59, 61): G, wheel lag 0.65 s, seed 67; H, 0.42 s, seed 71; I, 0.75 s,
seed 73. 54 survey drills each (nine takes, two tachs, three launchers).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.65 --seed 67 --takes "0.8,1.75,2.35,3.15,4.1,5.4,6.5,7.45,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score rows.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

`--grids` now prints the two measures ("Error measures"). On set D it reproduces the earlier file's tables.

## Prediction (written and committed before any of G, H, I was captured)

With the parabola pick, verdicts rounded to 0.5 ms as the Pi rounds them, pooled over G, H and I (162 builds):

- (q1) the nine-point grid has fewer builds off by more than 1 ms than the shipped grid, by at least 4;
- (q2) its mean absolute error is lower;
- (q3) most of the shipped grid's large misses sit at the 0.8 and 1.75 ms takes (its 0-2 gap) and the 7.45 ms take
  (read as 8.0 is 0.55 off, so not a large miss; the large misses there come from the jittery tach if at all);
- (q4) no instant build is advised on either grid.

## Decision rule (written with the prediction)

`TAKE_SURVEY_GRID_US` becomes 0-8 ms by 1 (firmware `controller.py` and `config.py`, the Pi's `host.TAKE_SURVEY_MS`
and `protocol.TAKE_SURVEY_TIMES`, with the older seven-value frame still decoded) only if, pooled over G, H and I with
the parabola:

1. the nine-point grid has fewer builds off by more than 1 ms than the shipped grid by **at least 4** (a margin
   because the nine-point grid costs two more fits a wheel, about 29% more survey time, and a frame change);
2. its mean absolute error is no higher;
3. it has no fewer builds within 0.5 ms than the shipped grid by more than 3;
4. no fewer spread takes named within 1 ms and advised by more than 2;
5. no more instant builds advised;
6. and on no single set does it have more builds off by more than 1 ms than the shipped grid.

Otherwise the shipped grid stays. The spline is reported, not decided.

## Results

(filled in after the capture)
